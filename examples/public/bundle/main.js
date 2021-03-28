
(function(l, r) { if (l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (window.location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.getElementsByTagName('head')[0].appendChild(r) })(window.document);
var app = (function () {
    'use strict';

    function noop() { }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = on_mount.map(run).filter(is_function);
                if (on_destroy) {
                    on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    function noop$1() { }
    const identity = x => x;
    function run$1(fn) {
        return fn();
    }
    function blank_object$1() {
        return Object.create(null);
    }
    function run_all$1(fns) {
        fns.forEach(run$1);
    }
    function is_function$1(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal$1(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function subscribe(store, ...callbacks) {
        if (store == null) {
            return noop$1;
        }
        const unsub = store.subscribe(...callbacks);
        return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
    }
    function component_subscribe(component, store, callback) {
        component.$$.on_destroy.push(subscribe(store, callback));
    }
    function null_to_empty(value) {
        return value == null ? '' : value;
    }
    function set_store_value(store, ret, value = ret) {
        store.set(value);
        return ret;
    }

    const is_client = typeof window !== 'undefined';
    let now = is_client
        ? () => window.performance.now()
        : () => Date.now();
    let raf = is_client ? cb => requestAnimationFrame(cb) : noop$1;

    const tasks = new Set();
    function run_tasks(now) {
        tasks.forEach(task => {
            if (!task.c(now)) {
                tasks.delete(task);
                task.f();
            }
        });
        if (tasks.size !== 0)
            raf(run_tasks);
    }
    /**
     * Creates a new task that runs on each raf frame
     * until it returns a falsy value or is aborted
     */
    function loop(callback) {
        let task;
        if (tasks.size === 0)
            raf(run_tasks);
        return {
            promise: new Promise(fulfill => {
                tasks.add(task = { c: callback, f: fulfill });
            }),
            abort() {
                tasks.delete(task);
            }
        };
    }

    function append$1(target, node) {
        target.appendChild(node);
    }
    function insert$1(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach$1(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element$1(name) {
        return document.createElement(name);
    }
    function svg_element(name) {
        return document.createElementNS('http://www.w3.org/2000/svg', name);
    }
    function text$1(data) {
        return document.createTextNode(data);
    }
    function space$1() {
        return text$1(' ');
    }
    function empty() {
        return text$1('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr$1(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children$1(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.data !== data)
            text.data = data;
    }
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let stylesheet;
    let active = 0;
    let current_rules = {};
    // https://github.com/darkskyapp/string-hash/blob/master/index.js
    function hash(str) {
        let hash = 5381;
        let i = str.length;
        while (i--)
            hash = ((hash << 5) - hash) ^ str.charCodeAt(i);
        return hash >>> 0;
    }
    function create_rule(node, a, b, duration, delay, ease, fn, uid = 0) {
        const step = 16.666 / duration;
        let keyframes = '{\n';
        for (let p = 0; p <= 1; p += step) {
            const t = a + (b - a) * ease(p);
            keyframes += p * 100 + `%{${fn(t, 1 - t)}}\n`;
        }
        const rule = keyframes + `100% {${fn(b, 1 - b)}}\n}`;
        const name = `__svelte_${hash(rule)}_${uid}`;
        if (!current_rules[name]) {
            if (!stylesheet) {
                const style = element$1('style');
                document.head.appendChild(style);
                stylesheet = style.sheet;
            }
            current_rules[name] = true;
            stylesheet.insertRule(`@keyframes ${name} ${rule}`, stylesheet.cssRules.length);
        }
        const animation = node.style.animation || '';
        node.style.animation = `${animation ? `${animation}, ` : ``}${name} ${duration}ms linear ${delay}ms 1 both`;
        active += 1;
        return name;
    }
    function delete_rule(node, name) {
        node.style.animation = (node.style.animation || '')
            .split(', ')
            .filter(name
            ? anim => anim.indexOf(name) < 0 // remove specific animation
            : anim => anim.indexOf('__svelte') === -1 // remove all Svelte animations
        )
            .join(', ');
        if (name && !--active)
            clear_rules();
    }
    function clear_rules() {
        raf(() => {
            if (active)
                return;
            let i = stylesheet.cssRules.length;
            while (i--)
                stylesheet.deleteRule(i);
            current_rules = {};
        });
    }

    let current_component$1;
    function set_current_component$1(component) {
        current_component$1 = component;
    }
    function get_current_component() {
        if (!current_component$1)
            throw new Error(`Function called outside component initialization`);
        return current_component$1;
    }
    function beforeUpdate(fn) {
        get_current_component().$$.before_update.push(fn);
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }
    function setContext(key, context) {
        get_current_component().$$.context.set(key, context);
    }
    function getContext(key) {
        return get_current_component().$$.context.get(key);
    }

    const dirty_components$1 = [];
    const binding_callbacks$1 = [];
    const render_callbacks$1 = [];
    const flush_callbacks$1 = [];
    const resolved_promise$1 = Promise.resolve();
    let update_scheduled$1 = false;
    function schedule_update$1() {
        if (!update_scheduled$1) {
            update_scheduled$1 = true;
            resolved_promise$1.then(flush$1);
        }
    }
    function add_render_callback$1(fn) {
        render_callbacks$1.push(fn);
    }
    let flushing$1 = false;
    const seen_callbacks$1 = new Set();
    function flush$1() {
        if (flushing$1)
            return;
        flushing$1 = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components$1.length; i += 1) {
                const component = dirty_components$1[i];
                set_current_component$1(component);
                update$1(component.$$);
            }
            dirty_components$1.length = 0;
            while (binding_callbacks$1.length)
                binding_callbacks$1.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks$1.length; i += 1) {
                const callback = render_callbacks$1[i];
                if (!seen_callbacks$1.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks$1.add(callback);
                    callback();
                }
            }
            render_callbacks$1.length = 0;
        } while (dirty_components$1.length);
        while (flush_callbacks$1.length) {
            flush_callbacks$1.pop()();
        }
        update_scheduled$1 = false;
        flushing$1 = false;
        seen_callbacks$1.clear();
    }
    function update$1($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all$1($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback$1);
        }
    }

    let promise;
    function wait() {
        if (!promise) {
            promise = Promise.resolve();
            promise.then(() => {
                promise = null;
            });
        }
        return promise;
    }
    function dispatch(node, direction, kind) {
        node.dispatchEvent(custom_event(`${direction ? 'intro' : 'outro'}${kind}`));
    }
    const outroing$1 = new Set();
    let outros$1;
    function group_outros() {
        outros$1 = {
            r: 0,
            c: [],
            p: outros$1 // parent group
        };
    }
    function check_outros() {
        if (!outros$1.r) {
            run_all$1(outros$1.c);
        }
        outros$1 = outros$1.p;
    }
    function transition_in$1(block, local) {
        if (block && block.i) {
            outroing$1.delete(block);
            block.i(local);
        }
    }
    function transition_out$1(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing$1.has(block))
                return;
            outroing$1.add(block);
            outros$1.c.push(() => {
                outroing$1.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    const null_transition = { duration: 0 };
    function create_in_transition(node, fn, params) {
        let config = fn(node, params);
        let running = false;
        let animation_name;
        let task;
        let uid = 0;
        function cleanup() {
            if (animation_name)
                delete_rule(node, animation_name);
        }
        function go() {
            const { delay = 0, duration = 300, easing = identity, tick = noop$1, css } = config || null_transition;
            if (css)
                animation_name = create_rule(node, 0, 1, duration, delay, easing, css, uid++);
            tick(0, 1);
            const start_time = now() + delay;
            const end_time = start_time + duration;
            if (task)
                task.abort();
            running = true;
            add_render_callback$1(() => dispatch(node, true, 'start'));
            task = loop(now => {
                if (running) {
                    if (now >= end_time) {
                        tick(1, 0);
                        dispatch(node, true, 'end');
                        cleanup();
                        return running = false;
                    }
                    if (now >= start_time) {
                        const t = easing((now - start_time) / duration);
                        tick(t, 1 - t);
                    }
                }
                return running;
            });
        }
        let started = false;
        return {
            start() {
                if (started)
                    return;
                delete_rule(node);
                if (is_function$1(config)) {
                    config = config();
                    wait().then(go);
                }
                else {
                    go();
                }
            },
            invalidate() {
                started = false;
            },
            end() {
                if (running) {
                    cleanup();
                    running = false;
                }
            }
        };
    }
    function create_component$1(block) {
        block && block.c();
    }
    function mount_component$1(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback$1(() => {
            const new_on_destroy = on_mount.map(run$1).filter(is_function$1);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all$1(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback$1);
    }
    function destroy_component$1(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all$1($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty$1(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components$1.push(component);
            schedule_update$1();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init$1(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component$1;
        set_current_component$1(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop$1,
            not_equal,
            bound: blank_object$1(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object$1(),
            dirty
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if ($$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty$1(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all$1($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(children$1(options.target));
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in$1(component.$$.fragment);
            mount_component$1(component, options.target, options.anchor);
            flush$1();
        }
        set_current_component$1(parent_component);
    }
    class SvelteComponent$1 {
        $destroy() {
            destroy_component$1(this, 1);
            this.$destroy = noop$1;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }

    //Solar month of 31 days.
    const SOLAR_MONTH_OF_31_DAYS = [1, 3, 5, 7, 8, 10, 12];

    /**
     * The day of the week.
     * @param {Date} n
     * @returns {number}
     */
    function theDayOfTheWeek(n) {
      let d = new Date(n).getDay();

      return d === 0 ? 7 : d;
    }

    /**
     * Format date stamp.
     * @param {Date} n
     * @param {string} f
     * @returns {string}
     */
    function formatDatetamp(n, f) {
      let d = new Date(n);
      let ty = d.getFullYear();
      let tm = d.getMonth() + 1;
      let td = d.getDate();
      let th = d.getHours();
      let tmin = d.getMinutes();
      let tse = d.getSeconds();

      let r = `${ty}-${tm}-${td}`;
      if (isNaN(d)) {
        return ""
      }
      switch (f) {
        case "ISO8601":
          r = `${ty}-${tm}-${td}T${th}:${tmin}:${tse}Z`;
          break;
        case "mm-yyyy" :
          r = `${tm}-${ty}`;
          break;
        case "dd/mm/yy" :
          r = `${td}/${tm}/${ty.toString().slice(-2)}`;
          break;
        case "yyyy-mm-dd" :
          r = `${ty}-${tm}-${td}`;
          break;
        case "dd.mm.yyyy" :
          r = `${td}.${tm}.${ty}`;
          break;
        case "dd/mm/yyyy" :
          r = `${td}/${tm}/${ty}`;
          break;
        case "yyyy-mm-dd" :
          r = `${ty}-${tm}-${td}`;
          break;
        case "dd-mm-yy" :
          r = `${td}-${tm}-${ty.toString().slice(-2)}`;
          break;
        case "mm-dd-yy" :
          r = `${tm}-${td}-${ty.toString().slice(-2)}`;
          break;
        default:
          r = `${ty}-${tm}-${td}`;
          break;
      }
      return r;
    }

    /**
     * Test solar month of 31 days.
     * @param {number} m
     * @returns {boolean}
     */
    function testSolarMonthOf31Days(m) {
      return !!~SOLAR_MONTH_OF_31_DAYS.indexOf(m);
    }

    /**
     * Test leap year.
     * @param {number} y
     * @returns {boolean}
     */
    function testLeapYear(y) {
      return (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
    }

    /**
     * Determine the number of days in the month.
     * @param {number} y
     * @param {number} m
     * @returns {number}
     */
    function testDaysInTheMouth(y, m) {
      let d = NaN;
      if (testLeapYear(y) && m === 2) {
        d = 29;
      } else if (m === 2) {
        d = 28;
      } else if (testSolarMonthOf31Days(m)) {
        d = 31;
      } else {
        d = 30;
      }
      return d;
    }

    /**
     * Get the year and month of the prev month.
     * @param {number} y
     * @param {number} m
     * @returns { [py:number, pm:number] }
     */
    function getPrevYearAndMonth(y, m) {
      let py = NaN;
      let pm = NaN;
      if (m !== 1) {
        pm = m - 1;
        py = y;
      } else {
        pm = 12;
        py = y - 1;
      }
      return [py, pm];
    }

    /**
     * Get the year and month of the next month.
     * @param {number} y
     * @param {number} m
     * @returns { [ny:number, nm:number] }
     */
    function getNextYearAndMonth(y, m) {
      let ny = NaN;
      let nm = NaN;
      if (m !== 12) {
        nm = m + 1;
        ny = y;
      } else {
        nm = 1;
        ny = y + 1;
      }
      return [ny, nm];
    }

    /**
     * Get date data for the first week of the month
     * @param {Date} n
     * @returns { Array }
     */
    function getFirstWeekOfTheMonth(n) {
      let td = new Date(n);
      let ty = td.getFullYear();
      let tm = td.getMonth() + 1;
      let dotw = theDayOfTheWeek(`${ty}-${tm}-1`);
      let [py, pm] = getPrevYearAndMonth(ty, tm);
      let pmd = testDaysInTheMouth(py, pm);
      let firstWeekList = [];
      firstWeekList.length = 7;
      let i = 8 - dotw;
      let times = dotw - 2;
      for (let index = 0; index < firstWeekList.length; index++) {
        firstWeekList[index] = new Date(`${py == ty ? ty : ty - 1}-${tm == 1 ? 12 : tm - 1}-${pmd - times}`);
        times--;
      }
      for (let j = 0; j < i; j++) {
        firstWeekList[7 - i + j] = new Date(`${ty}-${tm}-${j + 1}`);
      }
      return firstWeekList;
    }

    /**
     * Get date data for the mid week of the month
     * @param {Date} n
     * @param {boolean} s
     * @returns { Array }
     */
    function getMidWeekOfTheMonth(n, s) {
      let td = new Date(+n + 24 * 60 * 60 * 1000);
      let ty = td.getFullYear();
      let tm = td.getMonth() + 1;
      let d = td.getDate();
      let midWeekList = [];
      midWeekList.length = 7;
      if (s && tm == 12) {
        for (let index = 0; index < midWeekList.length; index++) {
          midWeekList[index] = new Date(`${ty + 1}-1-${d + index}`);
        }
      } else {
        for (let index = 0; index < midWeekList.length; index++) {
          midWeekList[index] = new Date(`${ty}-${tm}-${d + index}`);
        }
      }
      return midWeekList;
    }

    /**
     * Get date data for the last week of the month
     * @param {Date} n
     * @returns { Array }
     */
    function getLastWeekOfTheMonth(n) {
      let td = new Date(+n + 24 * 60 * 60 * 1000);
      let ty = td.getFullYear();
      let tm = td.getMonth() + 1;
      let d = td.getDate();
      let [ny, nm] = getNextYearAndMonth(ty, tm);
      let lastWeekList = [];
      let cmd = testDaysInTheMouth(ty, tm);
      let times = cmd - d + 1;
      for (let index = 0; index < times; index++) {
        lastWeekList[index] = new Date(`${ty}-${tm}-${d + index}`);
      }
      for (let index = 0; index < 7 - times; index++) {
        lastWeekList[+times + index] = new Date(`${ny == ty ? ty : ty + 1}-${nm == 1 ? 1 : tm + 1}-${index + 1}`);
      }
      lastWeekList.length = 7;
      return lastWeekList;
    }

    /**
     * Get weekly data for the month of the specified date.
     * @param {Date} n
     * @returns { Array }
     */
    function getThisMonthData(n) {
      let td = new Date(n);
      let ty = td.getFullYear();
      let tm = td.getMonth() + 1;
      let d = td.getDate();
      let [ny, nm] = getNextYearAndMonth(ty, tm);
      let cmd = testDaysInTheMouth(ty, tm);
      //The first week
      let theFirstWeek = getFirstWeekOfTheMonth(n);
      //The second week
      let theSecondWeek = getMidWeekOfTheMonth(theFirstWeek[6]);
      //The third week
      let theThirdWeek = getMidWeekOfTheMonth(theSecondWeek[6]);
      //The fourth week
      let theFourthWeek = getMidWeekOfTheMonth(theThirdWeek[6]);
      //The fifth week
      let fifthWeek;
      let hasSixthWeek;
      switch (true) {
        case cmd - new Date(theFourthWeek[6]).getDate() === 7:
          fifthWeek = getLastWeekOfTheMonth(theFourthWeek[6]);
          hasSixthWeek = true;
          break;
        case cmd - new Date(theFourthWeek[6]).getDate() > 7:
          fifthWeek = getMidWeekOfTheMonth(theFourthWeek[6]);
          hasSixthWeek = true;
          break;
        default:
          fifthWeek = getLastWeekOfTheMonth(theFourthWeek[6]);
          hasSixthWeek = false;
          break;
      }
      //The sixth week
      let sixthWeek = hasSixthWeek ? getLastWeekOfTheMonth(fifthWeek[6]) : getMidWeekOfTheMonth(fifthWeek[6], tm !== 11);
      return [theFirstWeek, theSecondWeek, theThirdWeek, theFourthWeek, fifthWeek, sixthWeek];
    }

    const subscriber_queue = [];
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */
    function writable(value, start = noop$1) {
        let stop;
        const subscribers = [];
        function set(new_value) {
            if (safe_not_equal$1(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (let i = 0; i < subscribers.length; i += 1) {
                        const s = subscribers[i];
                        s[1]();
                        subscriber_queue.push(s, value);
                    }
                    if (run_queue) {
                        for (let i = 0; i < subscriber_queue.length; i += 2) {
                            subscriber_queue[i][0](subscriber_queue[i + 1]);
                        }
                        subscriber_queue.length = 0;
                    }
                }
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop$1) {
            const subscriber = [run, invalidate];
            subscribers.push(subscriber);
            if (subscribers.length === 1) {
                stop = start(set) || noop$1;
            }
            run(value);
            return () => {
                const index = subscribers.indexOf(subscriber);
                if (index !== -1) {
                    subscribers.splice(index, 1);
                }
                if (subscribers.length === 0) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }

    function cubicOut(t) {
        const f = t - 1.0;
        return f * f * f + 1.0;
    }

    function fly(node, { delay = 0, duration = 400, easing = cubicOut, x = 0, y = 0, opacity = 0 }) {
        const style = getComputedStyle(node);
        const target_opacity = +style.opacity;
        const transform = style.transform === 'none' ? '' : style.transform;
        const od = target_opacity * (1 - opacity);
        return {
            delay,
            duration,
            easing,
            css: (t, u) => `
			transform: ${transform} translate(${(1 - t) * x}px, ${(1 - t) * y}px);
			opacity: ${target_opacity - (od * u)}`
        };
    }

    var noun = {
      zh: {
        weekShortAbbreviation: ["一", "二", "三", "四", "五", "六", "日"],
        weekAbbreviation: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"],
        weekFullName: ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"],
        monthAbbreviation: ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"],
        monthFullName: ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"],
        today: "今天",
        doneName: "完成",
        prevName: "上一页",
        nextName:"下一页"
      },
      en: {
        weekShortAbbreviation: ["M", "T", "W", "T", "F", "S", "S"],
        weekAbbreviation: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        weekFullName: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        monthAbbreviation: ["Jan", "Feb", "Mar", "Apr", "May", "June", "July", "Aug", "Sept", "Oct", "Nov", "Dec"],
        monthFullName: [
          "January",
          "February",
          "March",
          "April",
          "May",
          "June",
          "July",
          "August",
          "September",
          "October",
          "November",
          "December",
        ],
        today: "Today",
        doneName: "Done",
        prevName: "Prev",
        nextName:"Next"
      },
      ru: {
        weekShortAbbreviation: ["П", "В", "С", "Ч", "П", "С", "В"],
        weekAbbreviation: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
        weekFullName: ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"],
        monthAbbreviation: ["Янв", "Фев", "Март", "Апр", "Май", "Июнь", "Июль", "Авг", "Сен", "Окт", "Ноя", "Дек"],
        monthFullName: [
          "Январь",
          "Февраль",
          "Март",
          "Апрель",
          "Май",
          "Июнь",
          "Июль",
          "Август",
          "Сентябрь",
          "Октябрь",
          "Ноябрь",
          "Декабрь",
        ],
        today: "Сегодня",
        doneName: "Готово",
        prevName: "Назад",
        nextName:"Вперед"
      }
    };

    /* Users/bighamster/try/praecox-datepicker/src/Selector/MonthTitle.svelte generated by Svelte v3.35.0 */

    function add_css() {
    	var style = element$1("style");
    	style.id = "svelte-f3v2n9-style";
    	style.textContent = ".titleBox.svelte-f3v2n9{display:block;width:100%;height:100%;text-align:center;position:relative}.month-title.svelte-f3v2n9{width:100%;position:absolute}.month-title-wrap.svelte-f3v2n9{width:60%;line-height:var(\n      --praecox-calendar-custom-head-height,\n      var(--praecox-calendar-head-height)\n    );text-align:center;color:var(\n      --praecox-calendar-custom-font-main-color,\n      var(--praecox-calendar-font-main-color)\n    );user-select:none;cursor:pointer;font-weight:bolder;font-family:var(\n      --praecox-calendar-custom-font-family,\n      var(--praecox-calendar-font-family)\n    );transition:background-color 0.2s ease-in-out 0s}.month-title-wrap.svelte-f3v2n9:hover{background:var(\n      --praecox-calendar-custom-background-hover,\n      var(--praecox-calendar-background-hover)\n    );color:var(\n      --praecox-calendar-custom-main-color-hover,\n      var(--praecox-calendar-main-color-hover)\n    );border-radius:var(\n      --praecox-calendar-custom-border-radius,\n      var(--praecox-calendar-border-radius)\n    )}.month-title-wrap.svelte-f3v2n9:active{background:var(\n      --praecox-calendar-custom-background-active,\n      var(--praecox-calendar-background-active)\n    );color:var(\n      --praecox-calendar-custom-main-color-active,\n      var(--praecox-calendar-main-color-active)\n    )}";
    	append$1(document.head, style);
    }

    // (95:0) {:else}
    function create_else_block(ctx) {
    	let div2;
    	let div1;
    	let div0;
    	let div0_intro;
    	let mounted;
    	let dispose;

    	function select_block_type_2(ctx, dirty) {
    		if (/*$praecoxCalendar*/ ctx[0].view === "month") return create_if_block_4;
    		if (/*$praecoxCalendar*/ ctx[0].view === "year") return create_if_block_5;
    		if (/*$praecoxCalendar*/ ctx[0].view === "multi-years") return create_if_block_6;
    	}

    	let current_block_type = select_block_type_2(ctx);
    	let if_block = current_block_type && current_block_type(ctx);

    	return {
    		c() {
    			div2 = element$1("div");
    			div1 = element$1("div");
    			div0 = element$1("div");
    			if (if_block) if_block.c();
    			attr$1(div0, "class", "month-title svelte-f3v2n9");
    			attr$1(div1, "class", "titleBox svelte-f3v2n9");
    			attr$1(div2, "class", "month-title-wrap svelte-f3v2n9");
    		},
    		m(target, anchor) {
    			insert$1(target, div2, anchor);
    			append$1(div2, div1);
    			append$1(div1, div0);
    			if (if_block) if_block.m(div0, null);

    			if (!mounted) {
    				dispose = listen(div2, "click", /*switchView*/ ctx[2]);
    				mounted = true;
    			}
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (current_block_type === (current_block_type = select_block_type_2(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if (if_block) if_block.d(1);
    				if_block = current_block_type && current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(div0, null);
    				}
    			}
    		},
    		i(local) {
    			if (local) {
    				if (!div0_intro) {
    					add_render_callback$1(() => {
    						div0_intro = create_in_transition(div0, fly, {
    							x: `${/*$praecoxCalendar*/ ctx[0].action == "prev" ? -50 : 50}`,
    							duration: 300
    						});

    						div0_intro.start();
    					});
    				}
    			}
    		},
    		o: noop$1,
    		d(detaching) {
    			if (detaching) detach$1(div2);

    			if (if_block) {
    				if_block.d();
    			}

    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (79:0) {#if $praecoxCalendar.flag}
    function create_if_block(ctx) {
    	let div2;
    	let div1;
    	let div0;
    	let div0_intro;
    	let mounted;
    	let dispose;

    	function select_block_type_1(ctx, dirty) {
    		if (/*$praecoxCalendar*/ ctx[0].view === "month") return create_if_block_1;
    		if (/*$praecoxCalendar*/ ctx[0].view === "year") return create_if_block_2;
    		if (/*$praecoxCalendar*/ ctx[0].view === "multi-years") return create_if_block_3;
    	}

    	let current_block_type = select_block_type_1(ctx);
    	let if_block = current_block_type && current_block_type(ctx);

    	return {
    		c() {
    			div2 = element$1("div");
    			div1 = element$1("div");
    			div0 = element$1("div");
    			if (if_block) if_block.c();
    			attr$1(div0, "class", "month-title svelte-f3v2n9");
    			attr$1(div1, "class", "titleBox svelte-f3v2n9");
    			attr$1(div2, "class", "month-title-wrap svelte-f3v2n9");
    		},
    		m(target, anchor) {
    			insert$1(target, div2, anchor);
    			append$1(div2, div1);
    			append$1(div1, div0);
    			if (if_block) if_block.m(div0, null);

    			if (!mounted) {
    				dispose = listen(div2, "click", /*switchView*/ ctx[2]);
    				mounted = true;
    			}
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (current_block_type === (current_block_type = select_block_type_1(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if (if_block) if_block.d(1);
    				if_block = current_block_type && current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(div0, null);
    				}
    			}
    		},
    		i(local) {
    			if (local) {
    				if (!div0_intro) {
    					add_render_callback$1(() => {
    						div0_intro = create_in_transition(div0, fly, {
    							x: `${/*$praecoxCalendar*/ ctx[0].action == "prev" ? -50 : 50}`,
    							duration: 300
    						});

    						div0_intro.start();
    					});
    				}
    			}
    		},
    		o: noop$1,
    		d(detaching) {
    			if (detaching) detach$1(div2);

    			if (if_block) {
    				if_block.d();
    			}

    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (105:58) 
    function create_if_block_6(ctx) {
    	let t_value = `${new Date(/*$praecoxCalendar*/ ctx[0].viewDate).getFullYear()} - ${+new Date(/*$praecoxCalendar*/ ctx[0].viewDate).getFullYear() + 11}` + "";
    	let t;

    	return {
    		c() {
    			t = text$1(t_value);
    		},
    		m(target, anchor) {
    			insert$1(target, t, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*$praecoxCalendar*/ 1 && t_value !== (t_value = `${new Date(/*$praecoxCalendar*/ ctx[0].viewDate).getFullYear()} - ${+new Date(/*$praecoxCalendar*/ ctx[0].viewDate).getFullYear() + 11}` + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach$1(t);
    		}
    	};
    }

    // (103:51) 
    function create_if_block_5(ctx) {
    	let t_value = new Date(/*$praecoxCalendar*/ ctx[0].viewDate).getFullYear() + "";
    	let t;

    	return {
    		c() {
    			t = text$1(t_value);
    		},
    		m(target, anchor) {
    			insert$1(target, t, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*$praecoxCalendar*/ 1 && t_value !== (t_value = new Date(/*$praecoxCalendar*/ ctx[0].viewDate).getFullYear() + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach$1(t);
    		}
    	};
    }

    // (101:8) {#if $praecoxCalendar.view === 'month'}
    function create_if_block_4(ctx) {
    	let t_value = noun[/*$praecoxCalendar*/ ctx[0].lang][/*$praecoxCalendar*/ ctx[0].monthName][new Date(/*$praecoxCalendar*/ ctx[0].viewDate).getMonth()] + "  " + new Date(/*$praecoxCalendar*/ ctx[0].viewDate).getFullYear() + "";
    	let t;

    	return {
    		c() {
    			t = text$1(t_value);
    		},
    		m(target, anchor) {
    			insert$1(target, t, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*$praecoxCalendar*/ 1 && t_value !== (t_value = noun[/*$praecoxCalendar*/ ctx[0].lang][/*$praecoxCalendar*/ ctx[0].monthName][new Date(/*$praecoxCalendar*/ ctx[0].viewDate).getMonth()] + "  " + new Date(/*$praecoxCalendar*/ ctx[0].viewDate).getFullYear() + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach$1(t);
    		}
    	};
    }

    // (89:58) 
    function create_if_block_3(ctx) {
    	let t_value = `${new Date(/*$praecoxCalendar*/ ctx[0].viewDate).getFullYear()} - ${+new Date(/*$praecoxCalendar*/ ctx[0].viewDate).getFullYear() + 11}` + "";
    	let t;

    	return {
    		c() {
    			t = text$1(t_value);
    		},
    		m(target, anchor) {
    			insert$1(target, t, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*$praecoxCalendar*/ 1 && t_value !== (t_value = `${new Date(/*$praecoxCalendar*/ ctx[0].viewDate).getFullYear()} - ${+new Date(/*$praecoxCalendar*/ ctx[0].viewDate).getFullYear() + 11}` + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach$1(t);
    		}
    	};
    }

    // (87:51) 
    function create_if_block_2(ctx) {
    	let t_value = new Date(/*$praecoxCalendar*/ ctx[0].viewDate).getFullYear() + "";
    	let t;

    	return {
    		c() {
    			t = text$1(t_value);
    		},
    		m(target, anchor) {
    			insert$1(target, t, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*$praecoxCalendar*/ 1 && t_value !== (t_value = new Date(/*$praecoxCalendar*/ ctx[0].viewDate).getFullYear() + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach$1(t);
    		}
    	};
    }

    // (85:8) {#if $praecoxCalendar.view === 'month'}
    function create_if_block_1(ctx) {
    	let t_value = noun[/*$praecoxCalendar*/ ctx[0].lang][/*$praecoxCalendar*/ ctx[0].monthName][new Date(/*$praecoxCalendar*/ ctx[0].viewDate).getMonth()] + "  " + new Date(/*$praecoxCalendar*/ ctx[0].viewDate).getFullYear() + "";
    	let t;

    	return {
    		c() {
    			t = text$1(t_value);
    		},
    		m(target, anchor) {
    			insert$1(target, t, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*$praecoxCalendar*/ 1 && t_value !== (t_value = noun[/*$praecoxCalendar*/ ctx[0].lang][/*$praecoxCalendar*/ ctx[0].monthName][new Date(/*$praecoxCalendar*/ ctx[0].viewDate).getMonth()] + "  " + new Date(/*$praecoxCalendar*/ ctx[0].viewDate).getFullYear() + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach$1(t);
    		}
    	};
    }

    function create_fragment(ctx) {
    	let if_block_anchor;

    	function select_block_type(ctx, dirty) {
    		if (/*$praecoxCalendar*/ ctx[0].flag) return create_if_block;
    		return create_else_block;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type(ctx);

    	return {
    		c() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if_block.m(target, anchor);
    			insert$1(target, if_block_anchor, anchor);
    		},
    		p(ctx, [dirty]) {
    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					transition_in$1(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			}
    		},
    		i(local) {
    			transition_in$1(if_block);
    		},
    		o: noop$1,
    		d(detaching) {
    			if_block.d(detaching);
    			if (detaching) detach$1(if_block_anchor);
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let $praecoxCalendar;
    	let praecoxCalendar = getContext("praecoxCalendarData");
    	component_subscribe($$self, praecoxCalendar, value => $$invalidate(0, $praecoxCalendar = value));

    	function switchView() {
    		if ($praecoxCalendar.view === "month") {
    			set_store_value(praecoxCalendar, $praecoxCalendar.view = "year", $praecoxCalendar);
    		} else if ($praecoxCalendar.view === "year") {
    			set_store_value(praecoxCalendar, $praecoxCalendar.view = "multi-years", $praecoxCalendar);
    		} else if ($praecoxCalendar.view === "multi-years") {
    			set_store_value(praecoxCalendar, $praecoxCalendar.view = "month", $praecoxCalendar);
    		}
    	}

    	return [$praecoxCalendar, praecoxCalendar, switchView];
    }

    class MonthTitle extends SvelteComponent$1 {
    	constructor(options) {
    		super();
    		if (!document.getElementById("svelte-f3v2n9-style")) add_css();
    		init$1(this, options, instance, create_fragment, safe_not_equal$1, {});
    	}
    }

    /* Users/bighamster/try/praecox-datepicker/src/@icons/ArrowBack.svelte generated by Svelte v3.35.0 */

    function create_if_block_1$1(ctx) {
    	let svg;
    	let g1;
    	let g0;
    	let rect;
    	let path;

    	return {
    		c() {
    			svg = svg_element("svg");
    			g1 = svg_element("g");
    			g0 = svg_element("g");
    			rect = svg_element("rect");
    			path = svg_element("path");
    			attr$1(rect, "width", "24");
    			attr$1(rect, "height", "24");
    			attr$1(rect, "transform", "rotate(90 12 12)");
    			attr$1(rect, "opacity", "0");
    			attr$1(path, "d", "M19 11H7.14l3.63-4.36a1 1 0 1 0-1.54-1.28l-5 6a1.19 1.19 0 0\n          0-.09.15c0 .05 0 .08-.07.13A1 1 0 0 0 4 12a1 1 0 0 0 .07.36c0 .05 0\n          .08.07.13a1.19 1.19 0 0 0 .09.15l5 6A1 1 0 0 0 10 19a1 1 0 0 0 .64-.23\n          1 1 0 0 0 .13-1.41L7.14 13H19a1 1 0 0 0 0-2z");
    			attr$1(g0, "data-name", "arrow-back");
    			attr$1(g1, "data-name", "Layer 2");
    			attr$1(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr$1(svg, "viewBox", "0 0 24 24");
    		},
    		m(target, anchor) {
    			insert$1(target, svg, anchor);
    			append$1(svg, g1);
    			append$1(g1, g0);
    			append$1(g0, rect);
    			append$1(g0, path);
    		},
    		d(detaching) {
    			if (detaching) detach$1(svg);
    		}
    	};
    }

    // (5:0) {#if pattern === 'outline'}
    function create_if_block$1(ctx) {
    	let svg;
    	let g1;
    	let g0;
    	let rect;
    	let path;

    	return {
    		c() {
    			svg = svg_element("svg");
    			g1 = svg_element("g");
    			g0 = svg_element("g");
    			rect = svg_element("rect");
    			path = svg_element("path");
    			attr$1(rect, "width", "24");
    			attr$1(rect, "height", "24");
    			attr$1(rect, "transform", "rotate(90 12 12)");
    			attr$1(rect, "opacity", "0");
    			attr$1(path, "d", "M19 11H7.14l3.63-4.36a1 1 0 1 0-1.54-1.28l-5 6a1.19 1.19 0 0\n          0-.09.15c0 .05 0 .08-.07.13A1 1 0 0 0 4 12a1 1 0 0 0 .07.36c0 .05 0\n          .08.07.13a1.19 1.19 0 0 0 .09.15l5 6A1 1 0 0 0 10 19a1 1 0 0 0 .64-.23\n          1 1 0 0 0 .13-1.41L7.14 13H19a1 1 0 0 0 0-2z");
    			attr$1(g0, "data-name", "arrow-back");
    			attr$1(g1, "data-name", "Layer 2");
    			attr$1(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr$1(svg, "viewBox", "0 0 24 24");
    		},
    		m(target, anchor) {
    			insert$1(target, svg, anchor);
    			append$1(svg, g1);
    			append$1(g1, g0);
    			append$1(g0, rect);
    			append$1(g0, path);
    		},
    		d(detaching) {
    			if (detaching) detach$1(svg);
    		}
    	};
    }

    function create_fragment$1(ctx) {
    	let if_block_anchor;

    	function select_block_type(ctx, dirty) {
    		if (/*pattern*/ ctx[0] === "outline") return create_if_block$1;
    		if (/*pattern*/ ctx[0] === "fill") return create_if_block_1$1;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type && current_block_type(ctx);

    	return {
    		c() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert$1(target, if_block_anchor, anchor);
    		},
    		p(ctx, [dirty]) {
    			if (current_block_type !== (current_block_type = select_block_type(ctx))) {
    				if (if_block) if_block.d(1);
    				if_block = current_block_type && current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			}
    		},
    		i: noop$1,
    		o: noop$1,
    		d(detaching) {
    			if (if_block) {
    				if_block.d(detaching);
    			}

    			if (detaching) detach$1(if_block_anchor);
    		}
    	};
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { pattern = "outline" } = $$props;

    	$$self.$$set = $$props => {
    		if ("pattern" in $$props) $$invalidate(0, pattern = $$props.pattern);
    	};

    	return [pattern];
    }

    class ArrowBack extends SvelteComponent$1 {
    	constructor(options) {
    		super();
    		init$1(this, options, instance$1, create_fragment$1, safe_not_equal$1, { pattern: 0 });
    	}
    }

    /* Users/bighamster/try/praecox-datepicker/src/Selector/Prev.svelte generated by Svelte v3.35.0 */

    function add_css$1() {
    	var style = element$1("style");
    	style.id = "svelte-12bcnst-style";
    	style.textContent = ".prev-button.svelte-12bcnst{width:20%;line-height:var(\n      --praecox-calendar-custom-head-height,\n      var(--praecox-calendar-head-height)\n    );text-align:center;fill:var(\n      --praecox-calendar-custom-font-secondary-color,\n      var(--praecox-calendar-font-secondary-color)\n    );cursor:pointer;transition:all 0.2s ease-in-out 0s}.prev-button.svelte-12bcnst:hover{fill:var(\n      --praecox-calendar-custom-main-color,\n      var(--praecox-calendar-main-color)\n    )}.prev-button.svelte-12bcnst:active{fill:var(\n      --praecox-calendar-custom-main-color-active,\n      var(--praecox-calendar-main-color-active)\n    )}.prev-button.svelte-12bcnst,.topButton.svelte-12bcnst{width:var(\n      --praecox-calendar-custom-icon-size,\n      var(--praecox-calendar-icon-size)\n    );margin:0 auto}";
    	append$1(document.head, style);
    }

    function create_fragment$2(ctx) {
    	let div1;
    	let div0;
    	let iconarrowback;
    	let div1_class_value;
    	let div1_title_value;
    	let current;
    	let mounted;
    	let dispose;
    	iconarrowback = new ArrowBack({});

    	return {
    		c() {
    			div1 = element$1("div");
    			div0 = element$1("div");
    			create_component$1(iconarrowback.$$.fragment);
    			attr$1(div0, "class", "topButton svelte-12bcnst");
    			attr$1(div1, "class", div1_class_value = "" + (null_to_empty("prev-button") + " svelte-12bcnst"));
    			attr$1(div1, "title", div1_title_value = noun[/*$praecoxCalendar*/ ctx[0].lang].prevName);
    		},
    		m(target, anchor) {
    			insert$1(target, div1, anchor);
    			append$1(div1, div0);
    			mount_component$1(iconarrowback, div0, null);
    			current = true;

    			if (!mounted) {
    				dispose = listen(div1, "click", /*prev*/ ctx[2]);
    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (!current || dirty & /*$praecoxCalendar*/ 1 && div1_title_value !== (div1_title_value = noun[/*$praecoxCalendar*/ ctx[0].lang].prevName)) {
    				attr$1(div1, "title", div1_title_value);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in$1(iconarrowback.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out$1(iconarrowback.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach$1(div1);
    			destroy_component$1(iconarrowback);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let $praecoxCalendar;
    	let praecoxCalendar = getContext("praecoxCalendarData");
    	component_subscribe($$self, praecoxCalendar, value => $$invalidate(0, $praecoxCalendar = value));

    	function prev() {
    		let nd = new Date($praecoxCalendar.viewDate);
    		let ty = nd.getFullYear();
    		let tm = nd.getMonth() + 1;
    		let td = nd.getDate();
    		let [py, pm] = getPrevYearAndMonth(ty, tm);

    		switch ($praecoxCalendar.view) {
    			case "month":
    				set_store_value(praecoxCalendar, $praecoxCalendar.viewDate = `${py}-${pm}-${td}`, $praecoxCalendar);
    				break;
    			case "year":
    				set_store_value(praecoxCalendar, $praecoxCalendar.viewDate = `${ty - 1}-${tm}-${td}`, $praecoxCalendar);
    				break;
    			case "multi-years":
    				set_store_value(praecoxCalendar, $praecoxCalendar.viewDate = `${ty - 9}-${tm}-${td}`, $praecoxCalendar);
    				break;
    		}

    		set_store_value(praecoxCalendar, $praecoxCalendar.action = "prev", $praecoxCalendar);
    		set_store_value(praecoxCalendar, $praecoxCalendar.flag = !$praecoxCalendar.flag, $praecoxCalendar);
    	}

    	return [$praecoxCalendar, praecoxCalendar, prev];
    }

    class Prev extends SvelteComponent$1 {
    	constructor(options) {
    		super();
    		if (!document.getElementById("svelte-12bcnst-style")) add_css$1();
    		init$1(this, options, instance$2, create_fragment$2, safe_not_equal$1, {});
    	}
    }

    /* Users/bighamster/try/praecox-datepicker/src/@icons/ArrowForward.svelte generated by Svelte v3.35.0 */

    function create_if_block_1$2(ctx) {
    	let svg;
    	let g1;
    	let g0;
    	let rect;
    	let path;

    	return {
    		c() {
    			svg = svg_element("svg");
    			g1 = svg_element("g");
    			g0 = svg_element("g");
    			rect = svg_element("rect");
    			path = svg_element("path");
    			attr$1(rect, "width", "24");
    			attr$1(rect, "height", "24");
    			attr$1(rect, "transform", "rotate(-90 12 12)");
    			attr$1(rect, "opacity", "0");
    			attr$1(path, "d", "M5 13h11.86l-3.63 4.36a1 1 0 0 0 1.54 1.28l5-6a1.19 1.19 0 0 0\n          .09-.15c0-.05.05-.08.07-.13A1 1 0 0 0 20 12a1 1 0 0\n          0-.07-.36c0-.05-.05-.08-.07-.13a1.19 1.19 0 0 0-.09-.15l-5-6A1 1 0 0 0\n          14 5a1 1 0 0 0-.64.23 1 1 0 0 0-.13 1.41L16.86 11H5a1 1 0 0 0 0 2z");
    			attr$1(g0, "data-name", "arrow-forward");
    			attr$1(g1, "data-name", "Layer 2");
    			attr$1(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr$1(svg, "viewBox", "0 0 24 24");
    		},
    		m(target, anchor) {
    			insert$1(target, svg, anchor);
    			append$1(svg, g1);
    			append$1(g1, g0);
    			append$1(g0, rect);
    			append$1(g0, path);
    		},
    		d(detaching) {
    			if (detaching) detach$1(svg);
    		}
    	};
    }

    // (5:0) {#if pattern === 'outline'}
    function create_if_block$2(ctx) {
    	let svg;
    	let g1;
    	let g0;
    	let rect;
    	let path;

    	return {
    		c() {
    			svg = svg_element("svg");
    			g1 = svg_element("g");
    			g0 = svg_element("g");
    			rect = svg_element("rect");
    			path = svg_element("path");
    			attr$1(rect, "width", "24");
    			attr$1(rect, "height", "24");
    			attr$1(rect, "transform", "rotate(-90 12 12)");
    			attr$1(rect, "opacity", "0");
    			attr$1(path, "d", "M5 13h11.86l-3.63 4.36a1 1 0 0 0 1.54 1.28l5-6a1.19 1.19 0 0 0\n          .09-.15c0-.05.05-.08.07-.13A1 1 0 0 0 20 12a1 1 0 0\n          0-.07-.36c0-.05-.05-.08-.07-.13a1.19 1.19 0 0 0-.09-.15l-5-6A1 1 0 0 0\n          14 5a1 1 0 0 0-.64.23 1 1 0 0 0-.13 1.41L16.86 11H5a1 1 0 0 0 0 2z");
    			attr$1(g0, "data-name", "arrow-forward");
    			attr$1(g1, "data-name", "Layer 2");
    			attr$1(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr$1(svg, "viewBox", "0 0 24 24");
    		},
    		m(target, anchor) {
    			insert$1(target, svg, anchor);
    			append$1(svg, g1);
    			append$1(g1, g0);
    			append$1(g0, rect);
    			append$1(g0, path);
    		},
    		d(detaching) {
    			if (detaching) detach$1(svg);
    		}
    	};
    }

    function create_fragment$3(ctx) {
    	let if_block_anchor;

    	function select_block_type(ctx, dirty) {
    		if (/*pattern*/ ctx[0] === "outline") return create_if_block$2;
    		if (/*pattern*/ ctx[0] === "fill") return create_if_block_1$2;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type && current_block_type(ctx);

    	return {
    		c() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert$1(target, if_block_anchor, anchor);
    		},
    		p(ctx, [dirty]) {
    			if (current_block_type !== (current_block_type = select_block_type(ctx))) {
    				if (if_block) if_block.d(1);
    				if_block = current_block_type && current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			}
    		},
    		i: noop$1,
    		o: noop$1,
    		d(detaching) {
    			if (if_block) {
    				if_block.d(detaching);
    			}

    			if (detaching) detach$1(if_block_anchor);
    		}
    	};
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let { pattern = "outline" } = $$props;

    	$$self.$$set = $$props => {
    		if ("pattern" in $$props) $$invalidate(0, pattern = $$props.pattern);
    	};

    	return [pattern];
    }

    class ArrowForward extends SvelteComponent$1 {
    	constructor(options) {
    		super();
    		init$1(this, options, instance$3, create_fragment$3, safe_not_equal$1, { pattern: 0 });
    	}
    }

    /* Users/bighamster/try/praecox-datepicker/src/Selector/Next.svelte generated by Svelte v3.35.0 */

    function add_css$2() {
    	var style = element$1("style");
    	style.id = "svelte-kd3qot-style";
    	style.textContent = ".next-button.svelte-kd3qot{width:20%;line-height:var(\n      --praecox-calendar-custom-head-height,\n      var(--praecox-calendar-head-height)\n    );text-align:center;fill:var(\n      --praecox-calendar-custom-font-secondary-color,\n      var(--praecox-calendar-font-secondary-color)\n    );cursor:pointer;transition:all 0.2s ease-in-out 0s}.next-button.svelte-kd3qot:hover{fill:var(\n      --praecox-calendar-custom-main-color,\n      var(--praecox-calendar-main-color)\n    )}.next-button.svelte-kd3qot:active{fill:var(\n      --praecox-calendar-custom-main-color-active,\n      var(--praecox-calendar-main-color-active)\n    )}.next-button.svelte-kd3qot,.topButton.svelte-kd3qot{width:var(\n      --praecox-calendar-custom-icon-size,\n      var(--praecox-calendar-icon-size)\n    );margin:0 auto}";
    	append$1(document.head, style);
    }

    function create_fragment$4(ctx) {
    	let div1;
    	let div0;
    	let iconarrowforward;
    	let div1_class_value;
    	let div1_title_value;
    	let current;
    	let mounted;
    	let dispose;
    	iconarrowforward = new ArrowForward({});

    	return {
    		c() {
    			div1 = element$1("div");
    			div0 = element$1("div");
    			create_component$1(iconarrowforward.$$.fragment);
    			attr$1(div0, "class", " topButton svelte-kd3qot");
    			attr$1(div1, "class", div1_class_value = "" + (null_to_empty("next-button") + " svelte-kd3qot"));
    			attr$1(div1, "title", div1_title_value = noun[/*$praecoxCalendar*/ ctx[0].lang].nextName);
    		},
    		m(target, anchor) {
    			insert$1(target, div1, anchor);
    			append$1(div1, div0);
    			mount_component$1(iconarrowforward, div0, null);
    			current = true;

    			if (!mounted) {
    				dispose = listen(div1, "click", /*next*/ ctx[2]);
    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (!current || dirty & /*$praecoxCalendar*/ 1 && div1_title_value !== (div1_title_value = noun[/*$praecoxCalendar*/ ctx[0].lang].nextName)) {
    				attr$1(div1, "title", div1_title_value);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in$1(iconarrowforward.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out$1(iconarrowforward.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach$1(div1);
    			destroy_component$1(iconarrowforward);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let $praecoxCalendar;
    	let praecoxCalendar = getContext("praecoxCalendarData");
    	component_subscribe($$self, praecoxCalendar, value => $$invalidate(0, $praecoxCalendar = value));

    	function next() {
    		let nd = new Date($praecoxCalendar.viewDate);
    		let ty = nd.getFullYear();
    		let tm = nd.getMonth() + 1;
    		let td = nd.getDate();
    		let [ny, nm] = getNextYearAndMonth(ty, tm);

    		switch ($praecoxCalendar.view) {
    			case "month":
    				set_store_value(praecoxCalendar, $praecoxCalendar.viewDate = `${ny}-${nm}-${td}`, $praecoxCalendar);
    				break;
    			case "year":
    				set_store_value(praecoxCalendar, $praecoxCalendar.viewDate = `${ty + 1}-${tm}-${td}`, $praecoxCalendar);
    				break;
    			case "multi-years":
    				set_store_value(praecoxCalendar, $praecoxCalendar.viewDate = `${ty + 9}-${tm}-${td}`, $praecoxCalendar);
    				break;
    		}

    		set_store_value(praecoxCalendar, $praecoxCalendar.action = "next", $praecoxCalendar);
    		set_store_value(praecoxCalendar, $praecoxCalendar.flag = !$praecoxCalendar.flag, $praecoxCalendar);
    	}

    	return [$praecoxCalendar, praecoxCalendar, next];
    }

    class Next extends SvelteComponent$1 {
    	constructor(options) {
    		super();
    		if (!document.getElementById("svelte-kd3qot-style")) add_css$2();
    		init$1(this, options, instance$4, create_fragment$4, safe_not_equal$1, {});
    	}
    }

    /* Users/bighamster/try/praecox-datepicker/src/Selector/Selector.svelte generated by Svelte v3.35.0 */

    function add_css$3() {
    	var style = element$1("style");
    	style.id = "svelte-1avf37b-style";
    	style.textContent = ".header.svelte-1avf37b{display:flex;width:var(\n      --praecox-calendar-custom-inner-width,\n      var(--praecox-calendar-inner-width)\n    );height:var(\n      --praecox-calendar-custom-head-height,\n      var(--praecox-calendar-head-height)\n    )}";
    	append$1(document.head, style);
    }

    function create_fragment$5(ctx) {
    	let div;
    	let prev;
    	let t0;
    	let monthtitle;
    	let t1;
    	let next;
    	let current;
    	prev = new Prev({});
    	monthtitle = new MonthTitle({});
    	next = new Next({});

    	return {
    		c() {
    			div = element$1("div");
    			create_component$1(prev.$$.fragment);
    			t0 = space$1();
    			create_component$1(monthtitle.$$.fragment);
    			t1 = space$1();
    			create_component$1(next.$$.fragment);
    			attr$1(div, "class", "header svelte-1avf37b");
    		},
    		m(target, anchor) {
    			insert$1(target, div, anchor);
    			mount_component$1(prev, div, null);
    			append$1(div, t0);
    			mount_component$1(monthtitle, div, null);
    			append$1(div, t1);
    			mount_component$1(next, div, null);
    			current = true;
    		},
    		p: noop$1,
    		i(local) {
    			if (current) return;
    			transition_in$1(prev.$$.fragment, local);
    			transition_in$1(monthtitle.$$.fragment, local);
    			transition_in$1(next.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out$1(prev.$$.fragment, local);
    			transition_out$1(monthtitle.$$.fragment, local);
    			transition_out$1(next.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach$1(div);
    			destroy_component$1(prev);
    			destroy_component$1(monthtitle);
    			destroy_component$1(next);
    		}
    	};
    }

    class Selector extends SvelteComponent$1 {
    	constructor(options) {
    		super();
    		if (!document.getElementById("svelte-1avf37b-style")) add_css$3();
    		init$1(this, options, null, create_fragment$5, safe_not_equal$1, {});
    	}
    }

    /* Users/bighamster/try/praecox-datepicker/src/body/CalendarBodyHead.svelte generated by Svelte v3.35.0 */

    function add_css$4() {
    	var style = element$1("style");
    	style.id = "svelte-zhqzr3-style";
    	style.textContent = ".calendar-week.svelte-zhqzr3{width:var(\n      --praecox-calendar-custom-inner-width,\n      var(--praecox-calendar-inner-width)\n    );display:inline-flex;justify-content:flex-start}.calendar-tableCell.svelte-zhqzr3{display:inline-flex;font-weight:500;padding:0;width:calc(\n      var(\n          --praecox-calendar-custom-inner-width,\n          var(--praecox-calendar-inner-width)\n        ) / 7\n    );height:calc(\n      var(\n          --praecox-calendar-custom-inner-height,\n          var(--praecox-calendar-inner-height)\n        ) / 6\n    );align-items:center;justify-content:center;user-select:none;font-size:12px;color:var(\n      --praecox-calendar-custom-font-secondary-color,\n      var(--praecox-calendar-font-secondary-color)\n    );font-family:var(\n      --praecox-calendar-custom-font-family,\n      var(--praecox-calendar-font-family)\n    )}.calendar-dayOfWeek.svelte-zhqzr3{text-decoration:none}";
    	append$1(document.head, style);
    }

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[3] = list[i];
    	return child_ctx;
    }

    // (55:4) {#each weekNames as item}
    function create_each_block(ctx) {
    	let th;
    	let abbr;
    	let t0_value = /*item*/ ctx[3] + "";
    	let t0;
    	let abbr_title_value;
    	let t1;

    	return {
    		c() {
    			th = element$1("th");
    			abbr = element$1("abbr");
    			t0 = text$1(t0_value);
    			t1 = space$1();
    			attr$1(abbr, "class", "calendar-dayOfWeek svelte-zhqzr3");
    			attr$1(abbr, "title", abbr_title_value = /*item*/ ctx[3]);
    			attr$1(th, "role", "columnheader");
    			attr$1(th, "scope", "col");
    			attr$1(th, "class", "calendar-tableCell svelte-zhqzr3");
    		},
    		m(target, anchor) {
    			insert$1(target, th, anchor);
    			append$1(th, abbr);
    			append$1(abbr, t0);
    			append$1(th, t1);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*weekNames*/ 1 && t0_value !== (t0_value = /*item*/ ctx[3] + "")) set_data(t0, t0_value);

    			if (dirty & /*weekNames*/ 1 && abbr_title_value !== (abbr_title_value = /*item*/ ctx[3])) {
    				attr$1(abbr, "title", abbr_title_value);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach$1(th);
    		}
    	};
    }

    function create_fragment$6(ctx) {
    	let thead;
    	let tr;
    	let each_value = /*weekNames*/ ctx[0];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	return {
    		c() {
    			thead = element$1("thead");
    			tr = element$1("tr");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr$1(tr, "role", "row");
    			attr$1(tr, "class", "calendar-week svelte-zhqzr3");
    			attr$1(thead, "role", "presentation");
    		},
    		m(target, anchor) {
    			insert$1(target, thead, anchor);
    			append$1(thead, tr);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(tr, null);
    			}
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*weekNames*/ 1) {
    				each_value = /*weekNames*/ ctx[0];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(tr, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		i: noop$1,
    		o: noop$1,
    		d(detaching) {
    			if (detaching) detach$1(thead);
    			destroy_each(each_blocks, detaching);
    		}
    	};
    }

    function instance$5($$self, $$props, $$invalidate) {
    	let weekNames;
    	let $praecoxCalendar;
    	let praecoxCalendar = getContext("praecoxCalendarData");
    	component_subscribe($$self, praecoxCalendar, value => $$invalidate(2, $praecoxCalendar = value));

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*$praecoxCalendar*/ 4) {
    			 $$invalidate(0, weekNames = noun[$praecoxCalendar.lang][$praecoxCalendar.weekName]);
    		}
    	};

    	return [weekNames, praecoxCalendar, $praecoxCalendar];
    }

    class CalendarBodyHead extends SvelteComponent$1 {
    	constructor(options) {
    		super();
    		if (!document.getElementById("svelte-zhqzr3-style")) add_css$4();
    		init$1(this, options, instance$5, create_fragment$6, safe_not_equal$1, {});
    	}
    }

    /* Users/bighamster/try/praecox-datepicker/src/body/CalendarBodyDay.svelte generated by Svelte v3.35.0 */

    function add_css$5() {
    	var style = element$1("style");
    	style.id = "svelte-6gixvs-style";
    	style.textContent = ".calendar-tableCell.svelte-6gixvs,.calendar-date.svelte-6gixvs{margin:0;padding:0;height:calc(\n      var(\n          --praecox-calendar-custom-inner-height,\n          var(--praecox-calendar-inner-height)\n        ) / 6\n    );width:calc(\n      var(\n          --praecox-calendar-custom-inner-width,\n          var(--praecox-calendar-inner-width)\n        ) / 7\n    );color:var(\n      --praecox-calendar-custom-font-main-color,\n      var(--praecox-calendar-font-main-color)\n    );font-family:var(\n      --praecox-calendar-custom-number-font-family,\n      var(--praecox-calendar-number-font-family)\n    )}.calendar-weekend.svelte-6gixvs{background:var(\n      --praecox-calendar-custom-weekend-color,\n      var(--praecox-calendar-weekend-color)\n    )}.calendar-outsideMonth.svelte-6gixvs{color:var(\n      --praecox-calendar-custom-outsidemonth-color,\n      var(--praecox-calendar-outsidemonth-color)\n    )}.calendar-outsideMonth-disabled.svelte-6gixvs{color:var(\n      --praecox-calendar-custom-font-disabled-color,\n      var(--praecox-calendar-font-disabled-color)\n    )}span.svelte-6gixvs{display:inline-block;padding:0;height:calc(\n      var(\n          --praecox-calendar-custom-inner-height,\n          var(--praecox-calendar-inner-height)\n        ) / 6\n    );width:calc(\n      var(\n          --praecox-calendar-custom-inner-width,\n          var(--praecox-calendar-inner-width)\n        ) / 7\n    );line-height:calc(\n      var(\n          --praecox-calendar-custom-inner-height,\n          var(--praecox-calendar-inner-height)\n        ) / 6\n    );cursor:pointer;user-select:none;transition:background-color 0.2s ease-in-out 0s;text-align:center}.calendar-date.svelte-6gixvs:hover{background:var(\n      --praecox-calendar-custom-secondary-color,\n      var(--praecox-calendar-secondary-color)\n    );color:var(\n      --praecox-calendar-custom-main-color-hover,\n      var(--praecox-calendar-main-color-hover)\n    )}.is-today.svelte-6gixvs{position:relative;background:var(\n      --praecox-calendar-custom-adjunctive-color,\n      var(--praecox-calendar-adjunctive-color)\n    )}.is-today.svelte-6gixvs::before{content:\"\";position:absolute;bottom:0;left:0;height:calc(\n      0.01 *\n        var(--praecox-calendar-custom-height, var(--praecox-calendar-height))\n    );width:calc(\n      var(\n          --praecox-calendar-custom-inner-width,\n          var(--praecox-calendar-inner-width)\n        ) / 7\n    );border-bottom-left-radius:var(\n      --praecox-calendar-custom-border-radius,\n      var(--praecox-calendar-border-radius)\n    );border-bottom-right-radius:var(\n      --praecox-calendar-custom-border-radius,\n      var(--praecox-calendar-border-radius)\n    );background:var(\n      --praecox-calendar-custom-main-color,\n      var(--praecox-calendar-main-color)\n    )}.is-today.svelte-6gixvs:hover{background:var(\n      --praecox-calendar-custom-secondary-color,\n      var(--praecox-calendar-secondary-color)\n    )}.is-today-selected.svelte-6gixvs:hover{background:var(\n      --praecox-calendar-custom-selected-color,\n      var(--praecox-calendar-selected-color)\n    );color:var(\n      --praecox-calendar-custom-overbackground-color,\n      var(--praecox-calendar-overbackground-color)\n    )}.is-selected.svelte-6gixvs{background:var(\n      --praecox-calendar-custom-selected-color,\n      var(--praecox-calendar-selected-color)\n    );color:var(\n      --praecox-calendar-custom-background,\n      var(--praecox-calendar-background)\n    );border-radius:var(\n      --praecox-calendar-custom-border-radius,\n      var(--praecox-calendar-border-radius)\n    )}.is-free-selected.svelte-6gixvs{background:var(\n      --praecox-calendar-custom-selected-color,\n      var(--praecox-calendar-selected-color)\n    );color:var(\n      --praecox-calendar-overbackground-color,\n      var(--praecox-calendar-overbackground-color)\n    )}.is-disabled.svelte-6gixvs{color:var(\n      --praecox-calendar-custom-font-disabled-color,\n      var(--praecox-calendar-font-disabled-color)\n    );pointer-events:none}.is-range-selection.svelte-6gixvs{background:var(\n      --praecox-calendar-custom-adjunctive-color,\n      var(--praecox-calendar-adjunctive-color)\n    );color:var(\n      --praecox-calendar-custom-font-main-color,\n      var(--praecox-calendar-font-main-color)\n    );border-radius:0}.is-selection-start.svelte-6gixvs{background:var(\n      --praecox-calendar-custom-selected-color,\n      var(--praecox-calendar-selected-color)\n    );color:var(\n      --praecox-calendar-overbackground-color,\n      var(--praecox-calendar-overbackground-color)\n    );border-top-left-radius:var(\n      --praecox-calendar-custom-border-radius,\n      var(--praecox-calendar-border-radius)\n    );border-bottom-left-radius:var(\n      --praecox-calendar-custom-border-radius,\n      var(--praecox-calendar-border-radius)\n    );border-top-right-radius:0;border-bottom-right-radius:0}.is-selection-end.svelte-6gixvs{background:var(\n      --praecox-calendar-custom-selected-color,\n      var(--praecox-calendar-selected-color)\n    );color:var(\n      --praecox-calendar-overbackground-color,\n      var(--praecox-calendar-overbackground-color)\n    );border-top-right-radius:var(\n      --praecox-calendar-custom-border-radius,\n      var(--praecox-calendar-border-radius)\n    );border-bottom-right-radius:var(\n      --praecox-calendar-custom-border-radius,\n      var(--praecox-calendar-border-radius)\n    );border-top-left-radius:0;border-bottom-left-radius:0}.is-focused.svelte-6gixvs{position:relative}.is-focused.svelte-6gixvs::before{content:\"\";position:absolute;top:15%;left:10%;width:calc(\n      0.01 *\n        var(--praecox-calendar-custom-height, var(--praecox-calendar-height))\n    );height:calc(\n      0.01 *\n        var(--praecox-calendar-custom-height, var(--praecox-calendar-height))\n    );border-radius:calc(\n      0.5 *\n        (\n          0.01 *\n            var(\n              --praecox-calendar-custom-height,\n              var(--praecox-calendar-height)\n            )\n        )\n    );background-color:var(\n      --praecox-calendar-custom-focused-color,\n      var(--praecox-calendar-focused-color)\n    )}";
    	append$1(document.head, style);
    }

    function create_fragment$7(ctx) {
    	let td;
    	let span;
    	let t;
    	let td_title_value;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			td = element$1("td");
    			span = element$1("span");
    			t = text$1(/*dayLabel*/ ctx[9]);
    			attr$1(span, "role", "presentation");
    			attr$1(span, "class", "calendar-date svelte-6gixvs");
    			toggle_class(span, "is-today", /*isToday*/ ctx[12]);
    			toggle_class(span, "is-selected", /*isSelected*/ ctx[0]);
    			toggle_class(span, "is-today-selected", /*isToday*/ ctx[12] && (/*isSelected*/ ctx[0] || /*isFreeSelected*/ ctx[4]));
    			toggle_class(span, "is-free-selected", /*isFreeSelected*/ ctx[4]);
    			toggle_class(span, "is-focused", /*isFocused*/ ctx[2]);
    			toggle_class(span, "is-disabled", /*disabled*/ ctx[3]);
    			toggle_class(span, "is-range-selection", /*isRangeSelection*/ ctx[6]);
    			toggle_class(span, "is-selection-start", /*isSelectionStart*/ ctx[7]);
    			toggle_class(span, "is-selection-end", /*isSelectionEnd*/ ctx[8]);
    			toggle_class(span, "calendar-outsideMonth", /*isOutsideMonth*/ ctx[11]);
    			toggle_class(span, "calendar-outsideMonth-disabled", /*isOutsideMonth*/ ctx[11] && /*disabled*/ ctx[3]);
    			toggle_class(span, "is-outsideMonth", /*isOutsideMonth*/ ctx[11]);
    			attr$1(td, "role", "gridcell");
    			attr$1(td, "class", "calendar-tableCell svelte-6gixvs");
    			attr$1(td, "aria-disabled", /*disabled*/ ctx[3]);
    			attr$1(td, "aria-selected", /*isSelected*/ ctx[0]);

    			attr$1(td, "title", td_title_value = /*isToday*/ ctx[12]
    			? noun[/*$praecoxCalendar*/ ctx[5].lang].today + " , " + /*formarWeekName*/ ctx[14](/*day*/ ctx[1]) + " , " + formatDatetamp(/*day*/ ctx[1], "yyyy-mm-dd")
    			: /*formarWeekName*/ ctx[14](/*day*/ ctx[1]) + " , " + formatDatetamp(/*day*/ ctx[1], "yyyy-mm-dd"));

    			toggle_class(td, "calendar-weekend", /*isWeekend*/ ctx[10]);
    		},
    		m(target, anchor) {
    			insert$1(target, td, anchor);
    			append$1(td, span);
    			append$1(span, t);

    			if (!mounted) {
    				dispose = listen(span, "click", /*pick*/ ctx[15]);
    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*dayLabel*/ 512) set_data(t, /*dayLabel*/ ctx[9]);

    			if (dirty & /*isToday*/ 4096) {
    				toggle_class(span, "is-today", /*isToday*/ ctx[12]);
    			}

    			if (dirty & /*isSelected*/ 1) {
    				toggle_class(span, "is-selected", /*isSelected*/ ctx[0]);
    			}

    			if (dirty & /*isToday, isSelected, isFreeSelected*/ 4113) {
    				toggle_class(span, "is-today-selected", /*isToday*/ ctx[12] && (/*isSelected*/ ctx[0] || /*isFreeSelected*/ ctx[4]));
    			}

    			if (dirty & /*isFreeSelected*/ 16) {
    				toggle_class(span, "is-free-selected", /*isFreeSelected*/ ctx[4]);
    			}

    			if (dirty & /*isFocused*/ 4) {
    				toggle_class(span, "is-focused", /*isFocused*/ ctx[2]);
    			}

    			if (dirty & /*disabled*/ 8) {
    				toggle_class(span, "is-disabled", /*disabled*/ ctx[3]);
    			}

    			if (dirty & /*isRangeSelection*/ 64) {
    				toggle_class(span, "is-range-selection", /*isRangeSelection*/ ctx[6]);
    			}

    			if (dirty & /*isSelectionStart*/ 128) {
    				toggle_class(span, "is-selection-start", /*isSelectionStart*/ ctx[7]);
    			}

    			if (dirty & /*isSelectionEnd*/ 256) {
    				toggle_class(span, "is-selection-end", /*isSelectionEnd*/ ctx[8]);
    			}

    			if (dirty & /*isOutsideMonth*/ 2048) {
    				toggle_class(span, "calendar-outsideMonth", /*isOutsideMonth*/ ctx[11]);
    			}

    			if (dirty & /*isOutsideMonth, disabled*/ 2056) {
    				toggle_class(span, "calendar-outsideMonth-disabled", /*isOutsideMonth*/ ctx[11] && /*disabled*/ ctx[3]);
    			}

    			if (dirty & /*isOutsideMonth*/ 2048) {
    				toggle_class(span, "is-outsideMonth", /*isOutsideMonth*/ ctx[11]);
    			}

    			if (dirty & /*disabled*/ 8) {
    				attr$1(td, "aria-disabled", /*disabled*/ ctx[3]);
    			}

    			if (dirty & /*isSelected*/ 1) {
    				attr$1(td, "aria-selected", /*isSelected*/ ctx[0]);
    			}

    			if (dirty & /*isToday, $praecoxCalendar, day*/ 4130 && td_title_value !== (td_title_value = /*isToday*/ ctx[12]
    			? noun[/*$praecoxCalendar*/ ctx[5].lang].today + " , " + /*formarWeekName*/ ctx[14](/*day*/ ctx[1]) + " , " + formatDatetamp(/*day*/ ctx[1], "yyyy-mm-dd")
    			: /*formarWeekName*/ ctx[14](/*day*/ ctx[1]) + " , " + formatDatetamp(/*day*/ ctx[1], "yyyy-mm-dd"))) {
    				attr$1(td, "title", td_title_value);
    			}

    			if (dirty & /*isWeekend*/ 1024) {
    				toggle_class(td, "calendar-weekend", /*isWeekend*/ ctx[10]);
    			}
    		},
    		i: noop$1,
    		o: noop$1,
    		d(detaching) {
    			if (detaching) detach$1(td);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function instance$6($$self, $$props, $$invalidate) {
    	let dayLabel;
    	let isWeekend;
    	let isOutsideMonth;
    	let isToday;
    	let $praecoxCalendar;
    	let { day = 1 } = $$props;
    	let { isSelected = false } = $$props;
    	let { isFocused = false } = $$props;
    	let { disabled = false } = $$props;
    	let { isFreeSelected = false } = $$props;
    	let isRangeSelection = false;
    	let isSelectionStart = false;
    	let isSelectionEnd = false;
    	let praecoxCalendar = getContext("praecoxCalendarData");
    	component_subscribe($$self, praecoxCalendar, value => $$invalidate(5, $praecoxCalendar = value));

    	beforeUpdate(() => {
    		if ($praecoxCalendar.pickerMode == "single") {
    			$$invalidate(0, isSelected = new Date(day).getTime() == new Date($praecoxCalendar.selected).getTime());
    		}

    		if ($praecoxCalendar.pickerMode == "range") {
    			$$invalidate(6, [isRangeSelection, isSelectionStart, isSelectionEnd] = testSelectedRange(day), isRangeSelection, $$invalidate(7, isSelectionStart), $$invalidate(8, isSelectionEnd));
    			$$invalidate(0, isSelected = isRangeSelection);
    		}
    	});

    	function formarWeekName(n) {
    		let dotw = theDayOfTheWeek(n);
    		return noun[$praecoxCalendar.lang][`weekFullName`][dotw - 1];
    	}

    	function pick() {
    		if ($praecoxCalendar.pickerMode == "single") {
    			set_store_value(praecoxCalendar, $praecoxCalendar.selected = new Date(day).getTime(), $praecoxCalendar);
    		}

    		if ($praecoxCalendar.pickerMode == "range") {
    			if ($praecoxCalendar.reselected && $praecoxCalendar.selected[0] && $praecoxCalendar.selected[1] && $praecoxCalendar.selected[0] !== $praecoxCalendar.selected[1]) {
    				set_store_value(praecoxCalendar, $praecoxCalendar.selected = [], $praecoxCalendar);
    			} else {
    				set_store_value(praecoxCalendar, $praecoxCalendar.selected = rangePicker($praecoxCalendar.selected), $praecoxCalendar);
    			}
    		}

    		if ($praecoxCalendar.pickerMode == "free") {
    			freePicker(day);
    		}

    		set_store_value(praecoxCalendar, $praecoxCalendar.changed += 1, $praecoxCalendar);
    	}

    	function testSelectedRange(n) {
    		let i = new Date(n).getTime();
    		let startDate = new Date($praecoxCalendar.selected[0]).getTime();
    		let endDate = new Date($praecoxCalendar.selected[1]).getTime();
    		return [i >= startDate && i <= endDate, i == startDate, i == endDate];
    	}

    	function rangePicker(arr) {
    		let thisDate = new Date(day).getTime();
    		let startDate = new Date(arr[0]).getTime();
    		let endDate = new Date(arr[1]).getTime();

    		if (!endDate || !startDate || startDate == thisDate) {
    			startDate = thisDate;
    			endDate = thisDate;
    		} else {
    			if (thisDate > endDate) {
    				endDate = thisDate;
    			} else if (thisDate < startDate || thisDate > startDate) {
    				startDate = thisDate;
    			} else if (thisDate == endDate) {
    				startDate = thisDate;
    			}
    		}

    		return [startDate, endDate];
    	}

    	function freePicker(n) {
    		let _date = new Date(n).getTime();
    		let r = new Set($praecoxCalendar.selected);

    		if (r.has(_date)) {
    			r.delete(_date);
    			set_store_value(praecoxCalendar, $praecoxCalendar.selected = [...new Set(r)], $praecoxCalendar);
    		} else {
    			set_store_value(praecoxCalendar, $praecoxCalendar.selected = [...$praecoxCalendar.selected, _date], $praecoxCalendar);
    			set_store_value(praecoxCalendar, $praecoxCalendar.selected = $praecoxCalendar.selected.sort(), $praecoxCalendar);
    		}
    	}

    	$$self.$$set = $$props => {
    		if ("day" in $$props) $$invalidate(1, day = $$props.day);
    		if ("isSelected" in $$props) $$invalidate(0, isSelected = $$props.isSelected);
    		if ("isFocused" in $$props) $$invalidate(2, isFocused = $$props.isFocused);
    		if ("disabled" in $$props) $$invalidate(3, disabled = $$props.disabled);
    		if ("isFreeSelected" in $$props) $$invalidate(4, isFreeSelected = $$props.isFreeSelected);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*day*/ 2) {
    			 $$invalidate(9, dayLabel = new Date(day).getDate());
    		}

    		if ($$self.$$.dirty & /*day*/ 2) {
    			 $$invalidate(10, isWeekend = theDayOfTheWeek(day) === 6 || theDayOfTheWeek(day) === 7);
    		}

    		if ($$self.$$.dirty & /*$praecoxCalendar, day*/ 34) {
    			 $$invalidate(11, isOutsideMonth = new Date($praecoxCalendar.viewDate).getMonth() != new Date(day).getMonth());
    		}

    		if ($$self.$$.dirty & /*$praecoxCalendar, day*/ 34) {
    			 $$invalidate(12, isToday = new Date($praecoxCalendar.nowDate).getDate() == new Date(day).getDate() && new Date($praecoxCalendar.nowDate).getMonth() == new Date(day).getMonth() && new Date($praecoxCalendar.nowDate).getFullYear() == new Date(day).getFullYear());
    		}
    	};

    	return [
    		isSelected,
    		day,
    		isFocused,
    		disabled,
    		isFreeSelected,
    		$praecoxCalendar,
    		isRangeSelection,
    		isSelectionStart,
    		isSelectionEnd,
    		dayLabel,
    		isWeekend,
    		isOutsideMonth,
    		isToday,
    		praecoxCalendar,
    		formarWeekName,
    		pick
    	];
    }

    class CalendarBodyDay extends SvelteComponent$1 {
    	constructor(options) {
    		super();
    		if (!document.getElementById("svelte-6gixvs-style")) add_css$5();

    		init$1(this, options, instance$6, create_fragment$7, safe_not_equal$1, {
    			day: 1,
    			isSelected: 0,
    			isFocused: 2,
    			disabled: 3,
    			isFreeSelected: 4
    		});
    	}
    }

    /* Users/bighamster/try/praecox-datepicker/src/body/CalendarBodyWeek.svelte generated by Svelte v3.35.0 */

    function add_css$6() {
    	var style = element$1("style");
    	style.id = "svelte-1jzj4i7-style";
    	style.textContent = "tr.svelte-1jzj4i7{margin:0;padding:0;display:inline-flex;justify-content:space-between;width:var(\n      --praecox-calendar-custom-inner-width,\n      var(--praecox-calendar-inner-width)\n    )}";
    	append$1(document.head, style);
    }

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[5] = list[i];
    	return child_ctx;
    }

    // (101:2) {#each week as item}
    function create_each_block$1(ctx) {
    	let calendarbodyday;
    	let current;

    	calendarbodyday = new CalendarBodyDay({
    			props: {
    				day: /*item*/ ctx[5],
    				isFreeSelected: /*testFreeSelected*/ ctx[3](/*item*/ ctx[5]),
    				isFocused: /*testMarked*/ ctx[4](/*item*/ ctx[5]),
    				disabled: filterDate(/*$praecoxCalendar*/ ctx[1].disabled, /*item*/ ctx[5])
    			}
    		});

    	return {
    		c() {
    			create_component$1(calendarbodyday.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component$1(calendarbodyday, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const calendarbodyday_changes = {};
    			if (dirty & /*week*/ 1) calendarbodyday_changes.day = /*item*/ ctx[5];
    			if (dirty & /*week*/ 1) calendarbodyday_changes.isFreeSelected = /*testFreeSelected*/ ctx[3](/*item*/ ctx[5]);
    			if (dirty & /*week*/ 1) calendarbodyday_changes.isFocused = /*testMarked*/ ctx[4](/*item*/ ctx[5]);
    			if (dirty & /*$praecoxCalendar, week*/ 3) calendarbodyday_changes.disabled = filterDate(/*$praecoxCalendar*/ ctx[1].disabled, /*item*/ ctx[5]);
    			calendarbodyday.$set(calendarbodyday_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in$1(calendarbodyday.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out$1(calendarbodyday.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component$1(calendarbodyday, detaching);
    		}
    	};
    }

    function create_fragment$8(ctx) {
    	let tr;
    	let current;
    	let each_value = /*week*/ ctx[0];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
    	}

    	const out = i => transition_out$1(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	return {
    		c() {
    			tr = element$1("tr");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr$1(tr, "role", "row");
    			attr$1(tr, "class", "svelte-1jzj4i7");
    		},
    		m(target, anchor) {
    			insert$1(target, tr, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(tr, null);
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*week, testFreeSelected, testMarked, filterDate, $praecoxCalendar*/ 27) {
    				each_value = /*week*/ ctx[0];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$1(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in$1(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block$1(child_ctx);
    						each_blocks[i].c();
    						transition_in$1(each_blocks[i], 1);
    						each_blocks[i].m(tr, null);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in$1(each_blocks[i]);
    			}

    			current = true;
    		},
    		o(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out$1(each_blocks[i]);
    			}

    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach$1(tr);
    			destroy_each(each_blocks, detaching);
    		}
    	};
    }

    function filterDate(arr, day) {
    	if (!arr) {
    		return;
    	}

    	let thisDate = new Date(day).getTime();

    	if (typeof arr[0] === "object") {
    		for (let index = 0; index < arr.length; index++) {
    			let arrItem = arr[index];

    			if (arrItem.length === 2 && new Date(arrItem[0]).getTime() < new Date(arrItem[1]).getTime()) {
    				if (thisDate >= new Date(arrItem[0]).getTime() && thisDate <= new Date(arrItem[1]).getTime()) {
    					return true;
    				}
    			} else {
    				for (let i = 0; i < arrItem.length; i++) {
    					if (new Date(arrItem[i]).getTime() == thisDate) {
    						return true;
    					}
    				}
    			}
    		}
    	} else {
    		if (arr.length === 2 && new Date(arr[0]).getTime() < new Date(arr[1]).getTime()) {
    			if (thisDate >= new Date(arr[0]).getTime() && thisDate <= new Date(arr[1]).getTime()) {
    				return true;
    			}
    		}

    		for (let index = 0; index < arr.length; index++) {
    			if (new Date(arr[index]).getTime() == thisDate) {
    				return true;
    			}
    		}
    	}
    }

    function formatDateArray(arr) {
    	let narr = [];

    	for (let index = 0; index < arr.length; index++) {
    		narr[index] = new Date(arr[index]).getTime();
    	}

    	return narr;
    }

    function instance$7($$self, $$props, $$invalidate) {
    	let $praecoxCalendar;
    	let { week = [] } = $$props;
    	let praecoxCalendar = getContext("praecoxCalendarData");
    	component_subscribe($$self, praecoxCalendar, value => $$invalidate(1, $praecoxCalendar = value));

    	function testFreeSelected(i) {
    		if ($praecoxCalendar.pickerMode == "free" && $praecoxCalendar.selected) {
    			let f = new Set(formatDateArray($praecoxCalendar.selected));
    			let td = new Date(i).getTime();

    			if (f.has(td)) {
    				return true;
    			}
    		}
    	}

    	function testMarked(i) {
    		if ($praecoxCalendar.focused) {
    			let f = new Set(formatDateArray($praecoxCalendar.focused));
    			let td = new Date(i).getTime();

    			if (f.has(td)) {
    				return true;
    			}
    		}
    	}

    	$$self.$$set = $$props => {
    		if ("week" in $$props) $$invalidate(0, week = $$props.week);
    	};

    	return [week, $praecoxCalendar, praecoxCalendar, testFreeSelected, testMarked];
    }

    class CalendarBodyWeek extends SvelteComponent$1 {
    	constructor(options) {
    		super();
    		if (!document.getElementById("svelte-1jzj4i7-style")) add_css$6();
    		init$1(this, options, instance$7, create_fragment$8, safe_not_equal$1, { week: 0 });
    	}
    }

    /* Users/bighamster/try/praecox-datepicker/src/body/CalendarBodyYear.svelte generated by Svelte v3.35.0 */

    function add_css$7() {
    	var style = element$1("style");
    	style.id = "svelte-1oe7p3e-style";
    	style.textContent = "tr.svelte-1oe7p3e{display:inline-flex;justify-content:flex-start}td.svelte-1oe7p3e,.praecox-Calendar-month.svelte-1oe7p3e{display:inline-flex;justify-content:center;line-height:calc(\n      (\n          var(\n            --praecox-calendar-custom-inner-height,\n            var(--praecox-calendar-inner-height)\n          )\n        ) / 4.2\n    );height:calc(\n      (\n          var(\n            --praecox-calendar-custom-inner-height,\n            var(--praecox-calendar-inner-height)\n          )\n        ) / 4.2\n    );width:calc(\n      var(\n          --praecox-calendar-custom-inner-width,\n          var(--praecox-calendar-inner-width)\n        ) / 3\n    );border-radius:var(\n      --praecox-calendar-custom-border-radius,\n      var(--praecox-calendar-border-radius)\n    );color:var(\n      --praecox-calendar-custom-font-main-color,\n      var(--praecox-calendar-font-main-color)\n    );font-family:var(\n      --praecox-calendar-custom-number-font-family,\n      var(--praecox-calendar-number-font-family)\n    )}.praecox-Calendar-month.svelte-1oe7p3e:hover{cursor:pointer;background:var(\n      --praecox-calendar-custom-background-hover,\n      var(--praecox-calendar-background-hover)\n    )}.current-month.svelte-1oe7p3e{color:var(\n      --praecox-calendar-custom-main-color,\n      var(--praecox-calendar-main-color)\n    )}";
    	append$1(document.head, style);
    }

    function get_each_context$2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[11] = list[i];
    	child_ctx[13] = i;
    	return child_ctx;
    }

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[11] = list[i];
    	child_ctx[13] = i;
    	return child_ctx;
    }

    function get_each_context_2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[11] = list[i];
    	child_ctx[13] = i;
    	return child_ctx;
    }

    function get_each_context_3(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[11] = list[i];
    	child_ctx[13] = i;
    	return child_ctx;
    }

    // (84:4) {#if i < 3}
    function create_if_block_3$1(ctx) {
    	let td;
    	let span;
    	let t0_value = /*item*/ ctx[11] + "";
    	let t0;
    	let t1;
    	let mounted;
    	let dispose;

    	function click_handler() {
    		return /*click_handler*/ ctx[7](/*i*/ ctx[13]);
    	}

    	return {
    		c() {
    			td = element$1("td");
    			span = element$1("span");
    			t0 = text$1(t0_value);
    			t1 = space$1();
    			attr$1(span, "role", "presentation");
    			attr$1(span, "class", " praecox-Calendar-month svelte-1oe7p3e");
    			toggle_class(span, "current-month", /*currentMonth*/ ctx[2] == /*i*/ ctx[13] && /*currentYear*/ ctx[1]);
    			attr$1(td, "role", "gridcell");
    			attr$1(td, "class", "svelte-1oe7p3e");
    		},
    		m(target, anchor) {
    			insert$1(target, td, anchor);
    			append$1(td, span);
    			append$1(span, t0);
    			append$1(td, t1);

    			if (!mounted) {
    				dispose = listen(td, "click", click_handler);
    				mounted = true;
    			}
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty & /*monthList*/ 1 && t0_value !== (t0_value = /*item*/ ctx[11] + "")) set_data(t0, t0_value);

    			if (dirty & /*currentMonth, currentYear*/ 6) {
    				toggle_class(span, "current-month", /*currentMonth*/ ctx[2] == /*i*/ ctx[13] && /*currentYear*/ ctx[1]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach$1(td);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (83:2) {#each monthList as item, i}
    function create_each_block_3(ctx) {
    	let if_block_anchor;
    	let if_block = /*i*/ ctx[13] < 3 && create_if_block_3$1(ctx);

    	return {
    		c() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert$1(target, if_block_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (/*i*/ ctx[13] < 3) if_block.p(ctx, dirty);
    		},
    		d(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach$1(if_block_anchor);
    		}
    	};
    }

    // (99:4) {#if i >= 3 && i < 6}
    function create_if_block_2$1(ctx) {
    	let td;
    	let span;
    	let t0_value = /*item*/ ctx[11] + "";
    	let t0;
    	let t1;
    	let mounted;
    	let dispose;

    	function click_handler_1() {
    		return /*click_handler_1*/ ctx[8](/*i*/ ctx[13]);
    	}

    	return {
    		c() {
    			td = element$1("td");
    			span = element$1("span");
    			t0 = text$1(t0_value);
    			t1 = space$1();
    			attr$1(span, "role", "presentation");
    			attr$1(span, "class", " praecox-Calendar-month svelte-1oe7p3e");
    			toggle_class(span, "current-month", /*currentMonth*/ ctx[2] == /*i*/ ctx[13] && /*currentYear*/ ctx[1]);
    			attr$1(td, "role", "gridcell");
    			attr$1(td, "class", "svelte-1oe7p3e");
    		},
    		m(target, anchor) {
    			insert$1(target, td, anchor);
    			append$1(td, span);
    			append$1(span, t0);
    			append$1(td, t1);

    			if (!mounted) {
    				dispose = listen(td, "click", click_handler_1);
    				mounted = true;
    			}
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty & /*monthList*/ 1 && t0_value !== (t0_value = /*item*/ ctx[11] + "")) set_data(t0, t0_value);

    			if (dirty & /*currentMonth, currentYear*/ 6) {
    				toggle_class(span, "current-month", /*currentMonth*/ ctx[2] == /*i*/ ctx[13] && /*currentYear*/ ctx[1]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach$1(td);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (98:2) {#each monthList as item, i}
    function create_each_block_2(ctx) {
    	let if_block_anchor;
    	let if_block = /*i*/ ctx[13] >= 3 && /*i*/ ctx[13] < 6 && create_if_block_2$1(ctx);

    	return {
    		c() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert$1(target, if_block_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (/*i*/ ctx[13] >= 3 && /*i*/ ctx[13] < 6) if_block.p(ctx, dirty);
    		},
    		d(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach$1(if_block_anchor);
    		}
    	};
    }

    // (113:4) {#if i >= 6 && i < 9}
    function create_if_block_1$3(ctx) {
    	let td;
    	let span;
    	let t0_value = /*item*/ ctx[11] + "";
    	let t0;
    	let t1;
    	let mounted;
    	let dispose;

    	function click_handler_2() {
    		return /*click_handler_2*/ ctx[9](/*i*/ ctx[13]);
    	}

    	return {
    		c() {
    			td = element$1("td");
    			span = element$1("span");
    			t0 = text$1(t0_value);
    			t1 = space$1();
    			attr$1(span, "role", "presentation");
    			attr$1(span, "class", " praecox-Calendar-month svelte-1oe7p3e");
    			toggle_class(span, "current-month", /*currentMonth*/ ctx[2] == /*i*/ ctx[13] && /*currentYear*/ ctx[1]);
    			attr$1(td, "role", "gridcell");
    			attr$1(td, "class", "svelte-1oe7p3e");
    		},
    		m(target, anchor) {
    			insert$1(target, td, anchor);
    			append$1(td, span);
    			append$1(span, t0);
    			append$1(td, t1);

    			if (!mounted) {
    				dispose = listen(td, "click", click_handler_2);
    				mounted = true;
    			}
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty & /*monthList*/ 1 && t0_value !== (t0_value = /*item*/ ctx[11] + "")) set_data(t0, t0_value);

    			if (dirty & /*currentMonth, currentYear*/ 6) {
    				toggle_class(span, "current-month", /*currentMonth*/ ctx[2] == /*i*/ ctx[13] && /*currentYear*/ ctx[1]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach$1(td);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (112:2) {#each monthList as item, i}
    function create_each_block_1(ctx) {
    	let if_block_anchor;
    	let if_block = /*i*/ ctx[13] >= 6 && /*i*/ ctx[13] < 9 && create_if_block_1$3(ctx);

    	return {
    		c() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert$1(target, if_block_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (/*i*/ ctx[13] >= 6 && /*i*/ ctx[13] < 9) if_block.p(ctx, dirty);
    		},
    		d(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach$1(if_block_anchor);
    		}
    	};
    }

    // (127:4) {#if i >= 9 && i < 12}
    function create_if_block$3(ctx) {
    	let td;
    	let span;
    	let t0_value = /*item*/ ctx[11] + "";
    	let t0;
    	let t1;
    	let mounted;
    	let dispose;

    	function click_handler_3() {
    		return /*click_handler_3*/ ctx[10](/*i*/ ctx[13]);
    	}

    	return {
    		c() {
    			td = element$1("td");
    			span = element$1("span");
    			t0 = text$1(t0_value);
    			t1 = space$1();
    			attr$1(span, "role", "presentation");
    			attr$1(span, "class", " praecox-Calendar-month svelte-1oe7p3e");
    			toggle_class(span, "current-month", /*currentMonth*/ ctx[2] == /*i*/ ctx[13] && /*currentYear*/ ctx[1]);
    			attr$1(td, "role", "gridcell");
    			attr$1(td, "class", "svelte-1oe7p3e");
    		},
    		m(target, anchor) {
    			insert$1(target, td, anchor);
    			append$1(td, span);
    			append$1(span, t0);
    			append$1(td, t1);

    			if (!mounted) {
    				dispose = listen(td, "click", click_handler_3);
    				mounted = true;
    			}
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty & /*monthList*/ 1 && t0_value !== (t0_value = /*item*/ ctx[11] + "")) set_data(t0, t0_value);

    			if (dirty & /*currentMonth, currentYear*/ 6) {
    				toggle_class(span, "current-month", /*currentMonth*/ ctx[2] == /*i*/ ctx[13] && /*currentYear*/ ctx[1]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach$1(td);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (126:2) {#each monthList as item, i}
    function create_each_block$2(ctx) {
    	let if_block_anchor;
    	let if_block = /*i*/ ctx[13] >= 9 && /*i*/ ctx[13] < 12 && create_if_block$3(ctx);

    	return {
    		c() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert$1(target, if_block_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (/*i*/ ctx[13] >= 9 && /*i*/ ctx[13] < 12) if_block.p(ctx, dirty);
    		},
    		d(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach$1(if_block_anchor);
    		}
    	};
    }

    function create_fragment$9(ctx) {
    	let tr0;
    	let t0;
    	let tr1;
    	let t1;
    	let tr2;
    	let t2;
    	let tr3;
    	let each_value_3 = /*monthList*/ ctx[0];
    	let each_blocks_3 = [];

    	for (let i = 0; i < each_value_3.length; i += 1) {
    		each_blocks_3[i] = create_each_block_3(get_each_context_3(ctx, each_value_3, i));
    	}

    	let each_value_2 = /*monthList*/ ctx[0];
    	let each_blocks_2 = [];

    	for (let i = 0; i < each_value_2.length; i += 1) {
    		each_blocks_2[i] = create_each_block_2(get_each_context_2(ctx, each_value_2, i));
    	}

    	let each_value_1 = /*monthList*/ ctx[0];
    	let each_blocks_1 = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks_1[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	let each_value = /*monthList*/ ctx[0];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$2(get_each_context$2(ctx, each_value, i));
    	}

    	return {
    		c() {
    			tr0 = element$1("tr");

    			for (let i = 0; i < each_blocks_3.length; i += 1) {
    				each_blocks_3[i].c();
    			}

    			t0 = space$1();
    			tr1 = element$1("tr");

    			for (let i = 0; i < each_blocks_2.length; i += 1) {
    				each_blocks_2[i].c();
    			}

    			t1 = space$1();
    			tr2 = element$1("tr");

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].c();
    			}

    			t2 = space$1();
    			tr3 = element$1("tr");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr$1(tr0, "role", "row");
    			attr$1(tr0, "class", "svelte-1oe7p3e");
    			attr$1(tr1, "role", "row");
    			attr$1(tr1, "class", "svelte-1oe7p3e");
    			attr$1(tr2, "role", "row");
    			attr$1(tr2, "class", "svelte-1oe7p3e");
    			attr$1(tr3, "role", "row");
    			attr$1(tr3, "class", "svelte-1oe7p3e");
    		},
    		m(target, anchor) {
    			insert$1(target, tr0, anchor);

    			for (let i = 0; i < each_blocks_3.length; i += 1) {
    				each_blocks_3[i].m(tr0, null);
    			}

    			insert$1(target, t0, anchor);
    			insert$1(target, tr1, anchor);

    			for (let i = 0; i < each_blocks_2.length; i += 1) {
    				each_blocks_2[i].m(tr1, null);
    			}

    			insert$1(target, t1, anchor);
    			insert$1(target, tr2, anchor);

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].m(tr2, null);
    			}

    			insert$1(target, t2, anchor);
    			insert$1(target, tr3, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(tr3, null);
    			}
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*pickMonth, currentMonth, currentYear, monthList*/ 23) {
    				each_value_3 = /*monthList*/ ctx[0];
    				let i;

    				for (i = 0; i < each_value_3.length; i += 1) {
    					const child_ctx = get_each_context_3(ctx, each_value_3, i);

    					if (each_blocks_3[i]) {
    						each_blocks_3[i].p(child_ctx, dirty);
    					} else {
    						each_blocks_3[i] = create_each_block_3(child_ctx);
    						each_blocks_3[i].c();
    						each_blocks_3[i].m(tr0, null);
    					}
    				}

    				for (; i < each_blocks_3.length; i += 1) {
    					each_blocks_3[i].d(1);
    				}

    				each_blocks_3.length = each_value_3.length;
    			}

    			if (dirty & /*pickMonth, currentMonth, currentYear, monthList*/ 23) {
    				each_value_2 = /*monthList*/ ctx[0];
    				let i;

    				for (i = 0; i < each_value_2.length; i += 1) {
    					const child_ctx = get_each_context_2(ctx, each_value_2, i);

    					if (each_blocks_2[i]) {
    						each_blocks_2[i].p(child_ctx, dirty);
    					} else {
    						each_blocks_2[i] = create_each_block_2(child_ctx);
    						each_blocks_2[i].c();
    						each_blocks_2[i].m(tr1, null);
    					}
    				}

    				for (; i < each_blocks_2.length; i += 1) {
    					each_blocks_2[i].d(1);
    				}

    				each_blocks_2.length = each_value_2.length;
    			}

    			if (dirty & /*pickMonth, currentMonth, currentYear, monthList*/ 23) {
    				each_value_1 = /*monthList*/ ctx[0];
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1(ctx, each_value_1, i);

    					if (each_blocks_1[i]) {
    						each_blocks_1[i].p(child_ctx, dirty);
    					} else {
    						each_blocks_1[i] = create_each_block_1(child_ctx);
    						each_blocks_1[i].c();
    						each_blocks_1[i].m(tr2, null);
    					}
    				}

    				for (; i < each_blocks_1.length; i += 1) {
    					each_blocks_1[i].d(1);
    				}

    				each_blocks_1.length = each_value_1.length;
    			}

    			if (dirty & /*pickMonth, currentMonth, currentYear, monthList*/ 23) {
    				each_value = /*monthList*/ ctx[0];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$2(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$2(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(tr3, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		i: noop$1,
    		o: noop$1,
    		d(detaching) {
    			if (detaching) detach$1(tr0);
    			destroy_each(each_blocks_3, detaching);
    			if (detaching) detach$1(t0);
    			if (detaching) detach$1(tr1);
    			destroy_each(each_blocks_2, detaching);
    			if (detaching) detach$1(t1);
    			if (detaching) detach$1(tr2);
    			destroy_each(each_blocks_1, detaching);
    			if (detaching) detach$1(t2);
    			if (detaching) detach$1(tr3);
    			destroy_each(each_blocks, detaching);
    		}
    	};
    }

    function instance$8($$self, $$props, $$invalidate) {
    	let monthList;
    	let currentYear;
    	let currentMonth;
    	let $praecoxCalendar;
    	let { dateDate = [] } = $$props;
    	let praecoxCalendar = getContext("praecoxCalendarData");
    	component_subscribe($$self, praecoxCalendar, value => $$invalidate(6, $praecoxCalendar = value));

    	function pickMonth(i) {
    		let d = new Date($praecoxCalendar.viewDate);
    		let ty = d.getFullYear();
    		let td = d.getDate();
    		set_store_value(praecoxCalendar, $praecoxCalendar.viewDate = `${ty}-${i + 1}-${td}`, $praecoxCalendar);
    		set_store_value(praecoxCalendar, $praecoxCalendar.view = "month", $praecoxCalendar);
    	}

    	const click_handler = i => pickMonth(i);
    	const click_handler_1 = i => pickMonth(i);
    	const click_handler_2 = i => pickMonth(i);
    	const click_handler_3 = i => pickMonth(i);

    	$$self.$$set = $$props => {
    		if ("dateDate" in $$props) $$invalidate(5, dateDate = $$props.dateDate);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*$praecoxCalendar*/ 64) {
    			 $$invalidate(0, monthList = noun[$praecoxCalendar.lang][$praecoxCalendar.monthName]);
    		}

    		if ($$self.$$.dirty & /*dateDate, $praecoxCalendar*/ 96) {
    			 $$invalidate(1, currentYear = new Date(dateDate).getFullYear() == new Date($praecoxCalendar.nowDate).getFullYear());
    		}

    		if ($$self.$$.dirty & /*$praecoxCalendar*/ 64) {
    			 $$invalidate(2, currentMonth = new Date($praecoxCalendar.nowDate).getMonth());
    		}
    	};

    	return [
    		monthList,
    		currentYear,
    		currentMonth,
    		praecoxCalendar,
    		pickMonth,
    		dateDate,
    		$praecoxCalendar,
    		click_handler,
    		click_handler_1,
    		click_handler_2,
    		click_handler_3
    	];
    }

    class CalendarBodyYear extends SvelteComponent$1 {
    	constructor(options) {
    		super();
    		if (!document.getElementById("svelte-1oe7p3e-style")) add_css$7();
    		init$1(this, options, instance$8, create_fragment$9, safe_not_equal$1, { dateDate: 5 });
    	}
    }

    /* Users/bighamster/try/praecox-datepicker/src/body/CalendarBodyMultiYears.svelte generated by Svelte v3.35.0 */

    function add_css$8() {
    	var style = element$1("style");
    	style.id = "svelte-1hcn8nq-style";
    	style.textContent = "tr.svelte-1hcn8nq{display:inline-flex;justify-content:flex-start}td.svelte-1hcn8nq,.praecox-Calendar-month.svelte-1hcn8nq{display:inline-flex;justify-content:center;line-height:calc(var(--praecox-calendar-inner-height) / 3.2);height:calc(var(--praecox-calendar-inner-height) / 3.2);width:calc(var(--praecox-calendar-inner-width) / 3);border-radius:var(\n      --praecox-calendar-custom-border-radius,\n      var(--praecox-calendar-border-radius)\n    );color:var(\n      --praecox-calendar-custom-font-main-color,\n      var(--praecox-calendar-font-main-color)\n    );font-family:var(\n      --praecox-calendar-custom-number-font-family,\n      var(--praecox-calendar-number-font-family)\n    )}.praecox-Calendar-month.svelte-1hcn8nq:hover{cursor:pointer;background:var(\n      --praecox-calendar-custom-background-hover,\n      var(--praecox-calendar-background-hover)\n    )}.current-year.svelte-1hcn8nq{color:var(\n      --praecox-calendar-custom-main-color,\n      var(--praecox-calendar-main-color)\n    )}";
    	append$1(document.head, style);
    }

    function get_each_context$3(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[8] = list[i];
    	child_ctx[10] = i;
    	return child_ctx;
    }

    function get_each_context_1$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[8] = list[i];
    	child_ctx[10] = i;
    	return child_ctx;
    }

    function get_each_context_2$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[8] = list[i];
    	child_ctx[10] = i;
    	return child_ctx;
    }

    // (69:4) {#if _i < 3}
    function create_if_block_2$2(ctx) {
    	let td;
    	let span;
    	let t0_value = /*item*/ ctx[8] + "";
    	let t0;
    	let t1;
    	let mounted;
    	let dispose;

    	function click_handler() {
    		return /*click_handler*/ ctx[4](/*item*/ ctx[8]);
    	}

    	return {
    		c() {
    			td = element$1("td");
    			span = element$1("span");
    			t0 = text$1(t0_value);
    			t1 = space$1();
    			attr$1(span, "role", "presentation");
    			attr$1(span, "class", " praecox-Calendar-month svelte-1hcn8nq");
    			toggle_class(span, "current-year", new Date(/*$praecoxCalendar*/ ctx[1].nowDate).getFullYear() === /*item*/ ctx[8]);
    			attr$1(td, "role", "gridcell");
    			attr$1(td, "class", "svelte-1hcn8nq");
    		},
    		m(target, anchor) {
    			insert$1(target, td, anchor);
    			append$1(td, span);
    			append$1(span, t0);
    			append$1(td, t1);

    			if (!mounted) {
    				dispose = listen(td, "click", click_handler);
    				mounted = true;
    			}
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty & /*yearList*/ 1 && t0_value !== (t0_value = /*item*/ ctx[8] + "")) set_data(t0, t0_value);

    			if (dirty & /*Date, $praecoxCalendar, yearList*/ 3) {
    				toggle_class(span, "current-year", new Date(/*$praecoxCalendar*/ ctx[1].nowDate).getFullYear() === /*item*/ ctx[8]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach$1(td);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (68:2) {#each yearList as item, _i}
    function create_each_block_2$1(ctx) {
    	let if_block_anchor;
    	let if_block = /*_i*/ ctx[10] < 3 && create_if_block_2$2(ctx);

    	return {
    		c() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert$1(target, if_block_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (/*_i*/ ctx[10] < 3) if_block.p(ctx, dirty);
    		},
    		d(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach$1(if_block_anchor);
    		}
    	};
    }

    // (83:4) {#if _i >= 3 && _i < 6}
    function create_if_block_1$4(ctx) {
    	let td;
    	let span;
    	let t0_value = /*item*/ ctx[8] + "";
    	let t0;
    	let t1;
    	let mounted;
    	let dispose;

    	function click_handler_1() {
    		return /*click_handler_1*/ ctx[5](/*item*/ ctx[8]);
    	}

    	return {
    		c() {
    			td = element$1("td");
    			span = element$1("span");
    			t0 = text$1(t0_value);
    			t1 = space$1();
    			attr$1(span, "role", "presentation");
    			attr$1(span, "class", " praecox-Calendar-month svelte-1hcn8nq");
    			toggle_class(span, "current-year", new Date(/*$praecoxCalendar*/ ctx[1].nowDate).getFullYear() === /*item*/ ctx[8]);
    			attr$1(td, "role", "gridcell");
    			attr$1(td, "class", "svelte-1hcn8nq");
    		},
    		m(target, anchor) {
    			insert$1(target, td, anchor);
    			append$1(td, span);
    			append$1(span, t0);
    			append$1(td, t1);

    			if (!mounted) {
    				dispose = listen(td, "click", click_handler_1);
    				mounted = true;
    			}
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty & /*yearList*/ 1 && t0_value !== (t0_value = /*item*/ ctx[8] + "")) set_data(t0, t0_value);

    			if (dirty & /*Date, $praecoxCalendar, yearList*/ 3) {
    				toggle_class(span, "current-year", new Date(/*$praecoxCalendar*/ ctx[1].nowDate).getFullYear() === /*item*/ ctx[8]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach$1(td);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (82:2) {#each yearList as item, _i}
    function create_each_block_1$1(ctx) {
    	let if_block_anchor;
    	let if_block = /*_i*/ ctx[10] >= 3 && /*_i*/ ctx[10] < 6 && create_if_block_1$4(ctx);

    	return {
    		c() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert$1(target, if_block_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (/*_i*/ ctx[10] >= 3 && /*_i*/ ctx[10] < 6) if_block.p(ctx, dirty);
    		},
    		d(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach$1(if_block_anchor);
    		}
    	};
    }

    // (97:4) {#if _i >= 6 && _i < 9}
    function create_if_block$4(ctx) {
    	let td;
    	let span;
    	let t0_value = /*item*/ ctx[8] + "";
    	let t0;
    	let t1;
    	let mounted;
    	let dispose;

    	function click_handler_2() {
    		return /*click_handler_2*/ ctx[6](/*item*/ ctx[8]);
    	}

    	return {
    		c() {
    			td = element$1("td");
    			span = element$1("span");
    			t0 = text$1(t0_value);
    			t1 = space$1();
    			attr$1(span, "role", "presentation");
    			attr$1(span, "class", " praecox-Calendar-month svelte-1hcn8nq");
    			toggle_class(span, "current-year", new Date(/*$praecoxCalendar*/ ctx[1].nowDate).getFullYear() === /*item*/ ctx[8]);
    			attr$1(td, "role", "gridcell");
    			attr$1(td, "class", "svelte-1hcn8nq");
    		},
    		m(target, anchor) {
    			insert$1(target, td, anchor);
    			append$1(td, span);
    			append$1(span, t0);
    			append$1(td, t1);

    			if (!mounted) {
    				dispose = listen(td, "click", click_handler_2);
    				mounted = true;
    			}
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty & /*yearList*/ 1 && t0_value !== (t0_value = /*item*/ ctx[8] + "")) set_data(t0, t0_value);

    			if (dirty & /*Date, $praecoxCalendar, yearList*/ 3) {
    				toggle_class(span, "current-year", new Date(/*$praecoxCalendar*/ ctx[1].nowDate).getFullYear() === /*item*/ ctx[8]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach$1(td);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (96:2) {#each yearList as item, _i}
    function create_each_block$3(ctx) {
    	let if_block_anchor;
    	let if_block = /*_i*/ ctx[10] >= 6 && /*_i*/ ctx[10] < 9 && create_if_block$4(ctx);

    	return {
    		c() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert$1(target, if_block_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (/*_i*/ ctx[10] >= 6 && /*_i*/ ctx[10] < 9) if_block.p(ctx, dirty);
    		},
    		d(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach$1(if_block_anchor);
    		}
    	};
    }

    function create_fragment$a(ctx) {
    	let tr0;
    	let t0;
    	let tr1;
    	let t1;
    	let tr2;
    	let each_value_2 = /*yearList*/ ctx[0];
    	let each_blocks_2 = [];

    	for (let i = 0; i < each_value_2.length; i += 1) {
    		each_blocks_2[i] = create_each_block_2$1(get_each_context_2$1(ctx, each_value_2, i));
    	}

    	let each_value_1 = /*yearList*/ ctx[0];
    	let each_blocks_1 = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks_1[i] = create_each_block_1$1(get_each_context_1$1(ctx, each_value_1, i));
    	}

    	let each_value = /*yearList*/ ctx[0];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$3(get_each_context$3(ctx, each_value, i));
    	}

    	return {
    		c() {
    			tr0 = element$1("tr");

    			for (let i = 0; i < each_blocks_2.length; i += 1) {
    				each_blocks_2[i].c();
    			}

    			t0 = space$1();
    			tr1 = element$1("tr");

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].c();
    			}

    			t1 = space$1();
    			tr2 = element$1("tr");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr$1(tr0, "role", "row");
    			attr$1(tr0, "class", "svelte-1hcn8nq");
    			attr$1(tr1, "role", "row");
    			attr$1(tr1, "class", "svelte-1hcn8nq");
    			attr$1(tr2, "role", "row");
    			attr$1(tr2, "class", "svelte-1hcn8nq");
    		},
    		m(target, anchor) {
    			insert$1(target, tr0, anchor);

    			for (let i = 0; i < each_blocks_2.length; i += 1) {
    				each_blocks_2[i].m(tr0, null);
    			}

    			insert$1(target, t0, anchor);
    			insert$1(target, tr1, anchor);

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].m(tr1, null);
    			}

    			insert$1(target, t1, anchor);
    			insert$1(target, tr2, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(tr2, null);
    			}
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*pickYear, yearList, Date, $praecoxCalendar*/ 11) {
    				each_value_2 = /*yearList*/ ctx[0];
    				let i;

    				for (i = 0; i < each_value_2.length; i += 1) {
    					const child_ctx = get_each_context_2$1(ctx, each_value_2, i);

    					if (each_blocks_2[i]) {
    						each_blocks_2[i].p(child_ctx, dirty);
    					} else {
    						each_blocks_2[i] = create_each_block_2$1(child_ctx);
    						each_blocks_2[i].c();
    						each_blocks_2[i].m(tr0, null);
    					}
    				}

    				for (; i < each_blocks_2.length; i += 1) {
    					each_blocks_2[i].d(1);
    				}

    				each_blocks_2.length = each_value_2.length;
    			}

    			if (dirty & /*pickYear, yearList, Date, $praecoxCalendar*/ 11) {
    				each_value_1 = /*yearList*/ ctx[0];
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1$1(ctx, each_value_1, i);

    					if (each_blocks_1[i]) {
    						each_blocks_1[i].p(child_ctx, dirty);
    					} else {
    						each_blocks_1[i] = create_each_block_1$1(child_ctx);
    						each_blocks_1[i].c();
    						each_blocks_1[i].m(tr1, null);
    					}
    				}

    				for (; i < each_blocks_1.length; i += 1) {
    					each_blocks_1[i].d(1);
    				}

    				each_blocks_1.length = each_value_1.length;
    			}

    			if (dirty & /*pickYear, yearList, Date, $praecoxCalendar*/ 11) {
    				each_value = /*yearList*/ ctx[0];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$3(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$3(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(tr2, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		i: noop$1,
    		o: noop$1,
    		d(detaching) {
    			if (detaching) detach$1(tr0);
    			destroy_each(each_blocks_2, detaching);
    			if (detaching) detach$1(t0);
    			if (detaching) detach$1(tr1);
    			destroy_each(each_blocks_1, detaching);
    			if (detaching) detach$1(t1);
    			if (detaching) detach$1(tr2);
    			destroy_each(each_blocks, detaching);
    		}
    	};
    }

    const showYearTotal = 9;

    function instance$9($$self, $$props, $$invalidate) {
    	let $praecoxCalendar;
    	let praecoxCalendar = getContext("praecoxCalendarData");
    	component_subscribe($$self, praecoxCalendar, value => $$invalidate(1, $praecoxCalendar = value));
    	let yearList = [];
    	let temporarilyArray = [];

    	onMount(() => {
    		let ty = new Date($praecoxCalendar.viewDate).getFullYear();
    		temporarilyArray.length = showYearTotal / 3;

    		for (let index = 0; index < showYearTotal; index++) {
    			$$invalidate(0, yearList[index] = ty + (-1 * ((showYearTotal - 1) / 2) + index), yearList);
    		}
    	});

    	function pickYear(i) {
    		let d = new Date($praecoxCalendar.viewDate);
    		let tm = d.getMonth() + 1;
    		let td = d.getDate();
    		set_store_value(praecoxCalendar, $praecoxCalendar.viewDate = `${i}-${tm}-${td}`, $praecoxCalendar);
    		set_store_value(praecoxCalendar, $praecoxCalendar.view = "year", $praecoxCalendar);
    	}

    	const click_handler = item => pickYear(item);
    	const click_handler_1 = item => pickYear(item);
    	const click_handler_2 = item => pickYear(item);

    	return [
    		yearList,
    		$praecoxCalendar,
    		praecoxCalendar,
    		pickYear,
    		click_handler,
    		click_handler_1,
    		click_handler_2
    	];
    }

    class CalendarBodyMultiYears extends SvelteComponent$1 {
    	constructor(options) {
    		super();
    		if (!document.getElementById("svelte-1hcn8nq-style")) add_css$8();
    		init$1(this, options, instance$9, create_fragment$a, safe_not_equal$1, {});
    	}
    }

    /* Users/bighamster/try/praecox-datepicker/src/body/CalendarBody.svelte generated by Svelte v3.35.0 */

    function add_css$9() {
    	var style = element$1("style");
    	style.id = "svelte-30qt3n-style";
    	style.textContent = ".calendar-body.svelte-30qt3n{margin:0 auto;padding:0;position:relative;overflow:hidden;width:var(\n      --praecox-calendar-custom-inner-width,\n      var(--praecox-calendar-inner-width)\n    );height:var(\n      --praecox-calendar-custom-inner-height,\n      var(--praecox-calendar-inner-height)\n    )}.praecox-calendar-body.svelte-30qt3n{position:absolute;top:0;left:0;margin:0;padding:0;border-spacing:0;width:var(\n      --praecox-calendar-custom-inner-width,\n      var(--praecox-calendar-inner-width)\n    );height:var(\n      --praecox-calendar-custom-inner-height,\n      var(--praecox-calendar-inner-height)\n    )}.calendar-body.svelte-30qt3n,.praecox-calendar-body.svelte-30qt3n:focus{outline:none}tbody.svelte-30qt3n{margin:0 auto;width:var(\n      --praecox-calendar-custom-inner-width,\n      var(--praecox-calendar-inner-width)\n    );height:var(\n      --praecox-calendar-custom-inner-height,\n      var(--praecox-calendar-inner-height)\n    )}";
    	append$1(document.head, style);
    }

    function get_each_context_1$2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[3] = list[i];
    	child_ctx[5] = i;
    	return child_ctx;
    }

    function get_each_context$4(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[3] = list[i];
    	child_ctx[5] = i;
    	return child_ctx;
    }

    // (115:55) 
    function create_if_block_4$1(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block_5$1, create_else_block_2];
    	const if_blocks = [];

    	function select_block_type_3(ctx, dirty) {
    		if (/*$praecoxCalendarData*/ ctx[0].flag) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type_3(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	return {
    		c() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert$1(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type_3(ctx);

    			if (current_block_type_index !== previous_block_index) {
    				group_outros();

    				transition_out$1(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in$1(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in$1(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out$1(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach$1(if_block_anchor);
    		}
    	};
    }

    // (95:48) 
    function create_if_block_2$3(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block_3$2, create_else_block_1];
    	const if_blocks = [];

    	function select_block_type_2(ctx, dirty) {
    		if (/*$praecoxCalendarData*/ ctx[0].flag) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type_2(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	return {
    		c() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert$1(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type_2(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out$1(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				} else {
    					if_block.p(ctx, dirty);
    				}

    				transition_in$1(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in$1(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out$1(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach$1(if_block_anchor);
    		}
    	};
    }

    // (69:2) {#if $praecoxCalendarData.view == 'month'}
    function create_if_block$5(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block_1$5, create_else_block$1];
    	const if_blocks = [];

    	function select_block_type_1(ctx, dirty) {
    		if (/*$praecoxCalendarData*/ ctx[0].flag) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type_1(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	return {
    		c() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert$1(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type_1(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out$1(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				} else {
    					if_block.p(ctx, dirty);
    				}

    				transition_in$1(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in$1(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out$1(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach$1(if_block_anchor);
    		}
    	};
    }

    // (125:4) {:else}
    function create_else_block_2(ctx) {
    	let table;
    	let tbody;
    	let calendarbodymultiyears;
    	let table_intro;
    	let current;
    	calendarbodymultiyears = new CalendarBodyMultiYears({});

    	return {
    		c() {
    			table = element$1("table");
    			tbody = element$1("tbody");
    			create_component$1(calendarbodymultiyears.$$.fragment);
    			attr$1(tbody, "role", "presentation");
    			attr$1(tbody, "class", "svelte-30qt3n");
    			attr$1(table, "role", "presentation");
    			attr$1(table, "class", " praecox-calendar-body svelte-30qt3n");
    		},
    		m(target, anchor) {
    			insert$1(target, table, anchor);
    			append$1(table, tbody);
    			mount_component$1(calendarbodymultiyears, tbody, null);
    			current = true;
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i(local) {
    			if (current) return;
    			transition_in$1(calendarbodymultiyears.$$.fragment, local);

    			if (local) {
    				if (!table_intro) {
    					add_render_callback$1(() => {
    						table_intro = create_in_transition(table, fly, {
    							x: `${/*$praecoxCalendarData*/ ctx[0].action == "prev"
							? -200
							: 200}`,
    							duration: 300
    						});

    						table_intro.start();
    					});
    				}
    			}

    			current = true;
    		},
    		o(local) {
    			transition_out$1(calendarbodymultiyears.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach$1(table);
    			destroy_component$1(calendarbodymultiyears);
    		}
    	};
    }

    // (116:4) {#if $praecoxCalendarData.flag}
    function create_if_block_5$1(ctx) {
    	let table;
    	let tbody;
    	let calendarbodymultiyears;
    	let table_intro;
    	let current;
    	calendarbodymultiyears = new CalendarBodyMultiYears({});

    	return {
    		c() {
    			table = element$1("table");
    			tbody = element$1("tbody");
    			create_component$1(calendarbodymultiyears.$$.fragment);
    			attr$1(tbody, "role", "presentation");
    			attr$1(tbody, "class", "svelte-30qt3n");
    			attr$1(table, "role", "presentation");
    			attr$1(table, "class", " praecox-calendar-body svelte-30qt3n");
    		},
    		m(target, anchor) {
    			insert$1(target, table, anchor);
    			append$1(table, tbody);
    			mount_component$1(calendarbodymultiyears, tbody, null);
    			current = true;
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i(local) {
    			if (current) return;
    			transition_in$1(calendarbodymultiyears.$$.fragment, local);

    			if (local) {
    				if (!table_intro) {
    					add_render_callback$1(() => {
    						table_intro = create_in_transition(table, fly, {
    							x: `${/*$praecoxCalendarData*/ ctx[0].action == "prev"
							? -200
							: 200}`,
    							duration: 300
    						});

    						table_intro.start();
    					});
    				}
    			}

    			current = true;
    		},
    		o(local) {
    			transition_out$1(calendarbodymultiyears.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach$1(table);
    			destroy_component$1(calendarbodymultiyears);
    		}
    	};
    }

    // (105:4) {:else}
    function create_else_block_1(ctx) {
    	let table;
    	let tbody;
    	let calendarbodyyear;
    	let table_intro;
    	let current;

    	calendarbodyyear = new CalendarBodyYear({
    			props: {
    				dateDate: /*$praecoxCalendarData*/ ctx[0].viewDate
    			}
    		});

    	return {
    		c() {
    			table = element$1("table");
    			tbody = element$1("tbody");
    			create_component$1(calendarbodyyear.$$.fragment);
    			attr$1(tbody, "role", "presentation");
    			attr$1(tbody, "class", "svelte-30qt3n");
    			attr$1(table, "role", "presentation");
    			attr$1(table, "class", " praecox-calendar-body svelte-30qt3n");
    		},
    		m(target, anchor) {
    			insert$1(target, table, anchor);
    			append$1(table, tbody);
    			mount_component$1(calendarbodyyear, tbody, null);
    			current = true;
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			const calendarbodyyear_changes = {};
    			if (dirty & /*$praecoxCalendarData*/ 1) calendarbodyyear_changes.dateDate = /*$praecoxCalendarData*/ ctx[0].viewDate;
    			calendarbodyyear.$set(calendarbodyyear_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in$1(calendarbodyyear.$$.fragment, local);

    			if (local) {
    				if (!table_intro) {
    					add_render_callback$1(() => {
    						table_intro = create_in_transition(table, fly, {
    							x: `${/*$praecoxCalendarData*/ ctx[0].action == "prev"
							? -200
							: 200}`,
    							duration: 300
    						});

    						table_intro.start();
    					});
    				}
    			}

    			current = true;
    		},
    		o(local) {
    			transition_out$1(calendarbodyyear.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach$1(table);
    			destroy_component$1(calendarbodyyear);
    		}
    	};
    }

    // (96:4) {#if $praecoxCalendarData.flag}
    function create_if_block_3$2(ctx) {
    	let table;
    	let tbody;
    	let calendarbodyyear;
    	let table_intro;
    	let current;

    	calendarbodyyear = new CalendarBodyYear({
    			props: {
    				dateDate: /*$praecoxCalendarData*/ ctx[0].viewDate
    			}
    		});

    	return {
    		c() {
    			table = element$1("table");
    			tbody = element$1("tbody");
    			create_component$1(calendarbodyyear.$$.fragment);
    			attr$1(tbody, "role", "presentation");
    			attr$1(tbody, "class", "svelte-30qt3n");
    			attr$1(table, "role", "presentation");
    			attr$1(table, "class", " praecox-calendar-body svelte-30qt3n");
    		},
    		m(target, anchor) {
    			insert$1(target, table, anchor);
    			append$1(table, tbody);
    			mount_component$1(calendarbodyyear, tbody, null);
    			current = true;
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			const calendarbodyyear_changes = {};
    			if (dirty & /*$praecoxCalendarData*/ 1) calendarbodyyear_changes.dateDate = /*$praecoxCalendarData*/ ctx[0].viewDate;
    			calendarbodyyear.$set(calendarbodyyear_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in$1(calendarbodyyear.$$.fragment, local);

    			if (local) {
    				if (!table_intro) {
    					add_render_callback$1(() => {
    						table_intro = create_in_transition(table, fly, {
    							x: `${/*$praecoxCalendarData*/ ctx[0].action == "prev"
							? -200
							: 200}`,
    							duration: 300
    						});

    						table_intro.start();
    					});
    				}
    			}

    			current = true;
    		},
    		o(local) {
    			transition_out$1(calendarbodyyear.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach$1(table);
    			destroy_component$1(calendarbodyyear);
    		}
    	};
    }

    // (82:4) {:else}
    function create_else_block$1(ctx) {
    	let table;
    	let calendarbodyhead;
    	let t;
    	let tbody;
    	let table_intro;
    	let current;
    	calendarbodyhead = new CalendarBodyHead({});
    	let each_value_1 = /*monthData*/ ctx[1];
    	let each_blocks = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks[i] = create_each_block_1$2(get_each_context_1$2(ctx, each_value_1, i));
    	}

    	const out = i => transition_out$1(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	return {
    		c() {
    			table = element$1("table");
    			create_component$1(calendarbodyhead.$$.fragment);
    			t = space$1();
    			tbody = element$1("tbody");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr$1(tbody, "role", "presentation");
    			attr$1(tbody, "class", "svelte-30qt3n");
    			attr$1(table, "role", "presentation");
    			attr$1(table, "class", " praecox-calendar-body svelte-30qt3n");
    		},
    		m(target, anchor) {
    			insert$1(target, table, anchor);
    			mount_component$1(calendarbodyhead, table, null);
    			append$1(table, t);
    			append$1(table, tbody);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(tbody, null);
    			}

    			current = true;
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (dirty & /*monthData*/ 2) {
    				each_value_1 = /*monthData*/ ctx[1];
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1$2(ctx, each_value_1, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in$1(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block_1$2(child_ctx);
    						each_blocks[i].c();
    						transition_in$1(each_blocks[i], 1);
    						each_blocks[i].m(tbody, null);
    					}
    				}

    				group_outros();

    				for (i = each_value_1.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in$1(calendarbodyhead.$$.fragment, local);

    			for (let i = 0; i < each_value_1.length; i += 1) {
    				transition_in$1(each_blocks[i]);
    			}

    			if (local) {
    				if (!table_intro) {
    					add_render_callback$1(() => {
    						table_intro = create_in_transition(table, fly, {
    							x: `${/*$praecoxCalendarData*/ ctx[0].action == "prev"
							? -200
							: 200}`,
    							duration: 300
    						});

    						table_intro.start();
    					});
    				}
    			}

    			current = true;
    		},
    		o(local) {
    			transition_out$1(calendarbodyhead.$$.fragment, local);
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out$1(each_blocks[i]);
    			}

    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach$1(table);
    			destroy_component$1(calendarbodyhead);
    			destroy_each(each_blocks, detaching);
    		}
    	};
    }

    // (70:4) {#if $praecoxCalendarData.flag}
    function create_if_block_1$5(ctx) {
    	let table;
    	let calendarbodyhead;
    	let t;
    	let tbody;
    	let table_intro;
    	let current;
    	calendarbodyhead = new CalendarBodyHead({});
    	let each_value = /*monthData*/ ctx[1];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$4(get_each_context$4(ctx, each_value, i));
    	}

    	const out = i => transition_out$1(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	return {
    		c() {
    			table = element$1("table");
    			create_component$1(calendarbodyhead.$$.fragment);
    			t = space$1();
    			tbody = element$1("tbody");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr$1(tbody, "role", "presentation");
    			attr$1(tbody, "class", "svelte-30qt3n");
    			attr$1(table, "role", "presentation");
    			attr$1(table, "class", " praecox-calendar-body svelte-30qt3n");
    		},
    		m(target, anchor) {
    			insert$1(target, table, anchor);
    			mount_component$1(calendarbodyhead, table, null);
    			append$1(table, t);
    			append$1(table, tbody);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(tbody, null);
    			}

    			current = true;
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (dirty & /*monthData*/ 2) {
    				each_value = /*monthData*/ ctx[1];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$4(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in$1(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block$4(child_ctx);
    						each_blocks[i].c();
    						transition_in$1(each_blocks[i], 1);
    						each_blocks[i].m(tbody, null);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in$1(calendarbodyhead.$$.fragment, local);

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in$1(each_blocks[i]);
    			}

    			if (local) {
    				if (!table_intro) {
    					add_render_callback$1(() => {
    						table_intro = create_in_transition(table, fly, {
    							x: `${/*$praecoxCalendarData*/ ctx[0].action == "prev"
							? -200
							: 200}`,
    							duration: 300
    						});

    						table_intro.start();
    					});
    				}
    			}

    			current = true;
    		},
    		o(local) {
    			transition_out$1(calendarbodyhead.$$.fragment, local);
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out$1(each_blocks[i]);
    			}

    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach$1(table);
    			destroy_component$1(calendarbodyhead);
    			destroy_each(each_blocks, detaching);
    		}
    	};
    }

    // (89:10) {#each monthData as item, i}
    function create_each_block_1$2(ctx) {
    	let calendarbodyweek;
    	let current;
    	calendarbodyweek = new CalendarBodyWeek({ props: { week: /*item*/ ctx[3] } });

    	return {
    		c() {
    			create_component$1(calendarbodyweek.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component$1(calendarbodyweek, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const calendarbodyweek_changes = {};
    			if (dirty & /*monthData*/ 2) calendarbodyweek_changes.week = /*item*/ ctx[3];
    			calendarbodyweek.$set(calendarbodyweek_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in$1(calendarbodyweek.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out$1(calendarbodyweek.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component$1(calendarbodyweek, detaching);
    		}
    	};
    }

    // (77:10) {#each monthData as item, i}
    function create_each_block$4(ctx) {
    	let calendarbodyweek;
    	let current;
    	calendarbodyweek = new CalendarBodyWeek({ props: { week: /*item*/ ctx[3] } });

    	return {
    		c() {
    			create_component$1(calendarbodyweek.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component$1(calendarbodyweek, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const calendarbodyweek_changes = {};
    			if (dirty & /*monthData*/ 2) calendarbodyweek_changes.week = /*item*/ ctx[3];
    			calendarbodyweek.$set(calendarbodyweek_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in$1(calendarbodyweek.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out$1(calendarbodyweek.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component$1(calendarbodyweek, detaching);
    		}
    	};
    }

    function create_fragment$b(ctx) {
    	let div;
    	let current_block_type_index;
    	let if_block;
    	let current;
    	const if_block_creators = [create_if_block$5, create_if_block_2$3, create_if_block_4$1];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*$praecoxCalendarData*/ ctx[0].view == "month") return 0;
    		if (/*$praecoxCalendarData*/ ctx[0].view == "year") return 1;
    		if (/*$praecoxCalendarData*/ ctx[0].view == "multi-years") return 2;
    		return -1;
    	}

    	if (~(current_block_type_index = select_block_type(ctx))) {
    		if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    	}

    	return {
    		c() {
    			div = element$1("div");
    			if (if_block) if_block.c();
    			attr$1(div, "class", "calendar-body svelte-30qt3n");
    			attr$1(div, "role", "grid");
    			attr$1(div, "tabindex", "0");
    			attr$1(div, "aria-readonly", "true");
    			attr$1(div, "aria-disabled", "false");
    		},
    		m(target, anchor) {
    			insert$1(target, div, anchor);

    			if (~current_block_type_index) {
    				if_blocks[current_block_type_index].m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if (~current_block_type_index) {
    					if_blocks[current_block_type_index].p(ctx, dirty);
    				}
    			} else {
    				if (if_block) {
    					group_outros();

    					transition_out$1(if_blocks[previous_block_index], 1, 1, () => {
    						if_blocks[previous_block_index] = null;
    					});

    					check_outros();
    				}

    				if (~current_block_type_index) {
    					if_block = if_blocks[current_block_type_index];

    					if (!if_block) {
    						if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    						if_block.c();
    					} else {
    						if_block.p(ctx, dirty);
    					}

    					transition_in$1(if_block, 1);
    					if_block.m(div, null);
    				} else {
    					if_block = null;
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in$1(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out$1(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach$1(div);

    			if (~current_block_type_index) {
    				if_blocks[current_block_type_index].d();
    			}
    		}
    	};
    }

    function instance$a($$self, $$props, $$invalidate) {
    	let monthData;
    	let $praecoxCalendarData;
    	let praecoxCalendarData = getContext("praecoxCalendarData");
    	component_subscribe($$self, praecoxCalendarData, value => $$invalidate(0, $praecoxCalendarData = value));

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*$praecoxCalendarData*/ 1) {
    			 $$invalidate(1, monthData = getThisMonthData($praecoxCalendarData.viewDate));
    		}
    	};

    	return [$praecoxCalendarData, monthData, praecoxCalendarData];
    }

    class CalendarBody extends SvelteComponent$1 {
    	constructor(options) {
    		super();
    		if (!document.getElementById("svelte-30qt3n-style")) add_css$9();
    		init$1(this, options, instance$a, create_fragment$b, safe_not_equal$1, {});
    	}
    }

    //Safari Date function polyfill
    !(function (_Date) {
      function standardizeArgs(args) {
        if (args.length === 1 && typeof args[0] === "string" && isNaN(_Date.parse(args[0]))) {
          args[0] = args[0].replace(/-/g, "/");
        }
        return Array.prototype.slice.call(args);
      }

      function $Date() {
        if (this instanceof $Date) {
          return new (Function.prototype.bind.apply(_Date, [null].concat(standardizeArgs(arguments))))();
        }
        return _Date();
      }
      $Date.prototype = _Date.prototype;

      $Date.now = _Date.now;
      $Date.UTC = _Date.UTC;
      $Date.parse = function () {
        return _Date.parse.apply(_Date, standardizeArgs(arguments));
      };

      Date = $Date;
    })(Date);

    /* Users/bighamster/try/praecox-datepicker/src/Calendar.svelte generated by Svelte v3.35.0 */

    function add_css$a() {
    	var style = element$1("style");
    	style.id = "svelte-1gg8d67-style";
    	style.textContent = ".calendar.svelte-1gg8d67{--praecox-calendar-width:330px;--praecox-calendar-height:310px;--praecox-calendar-inner-width:310px;--praecox-calendar-inner-height:220px;--praecox-calendar-head-height:48px;--praecox-calendar-icon-size:20px;--praecox-calendar-border-radius:3px;--praecox-calendar-font-family:sans-serif;--praecox-calendar-number-font-family:\"Open Sans\", sans-serif;position:relative;width:var(--praecox-calendar-custom-width, var(--praecox-calendar-width));height:var(\n      --praecox-calendar-custom-height,\n      var(--praecox-calendar-height)\n    );border-radius:var(\n      --praecox-calendar-custom-border-radius,\n      var(--praecox-calendar-border-radius)\n    );display:flex;justify-content:center;align-items:center}.calendar-light.svelte-1gg8d67{--praecox-calendar-main-color:#0060df;--praecox-calendar-main-color-hover:#0a84ff;--praecox-calendar-main-color-active:#0060df;--praecox-calendar-focused-color:#12bc00;--praecox-calendar-adjunctive-color:rgba(0, 96, 223, 0.1);--praecox-calendar-secondary-color:rgba(0, 96, 223, 0.2);--praecox-calendar-selected-color:#002275;--praecox-calendar-weekend-color:#f9f9fa;--praecox-calendar-outsidemonth-color:#b1b1b3;--praecox-calendar-overbackground-color:#f5f8ff;--praecox-calendar-font-main-color:#181818;--praecox-calendar-font-disabled-color:#d7d7db;--praecox-calendar-font-secondary-color:#b1b1b3;--praecox-calendar-background:#ffffff;--praecox-calendar-background-hover:#f5f8ff;--praecox-calendar-border:1px solid #ededf0;--praecox-calendar-boxshadow:0px 1px solid #ededf0;background:var(\n      --praecox-calendar-custom-background,\n      var(--praecox-calendar-background)\n    );border:var(\n      --praecox-calendar-custom-border,\n      var(--praecox-calendar-border)\n    );box-shadow:var(\n      --praecox-calendar-custom-boxshadow,\n      var(--praecox-calendar-boxshadow)\n    )}.calendar-dark.svelte-1gg8d67{--praecox-calendar-main-color:#0066ff;--praecox-calendar-main-color-hover:#71a5ff;--praecox-calendar-main-color-active:#0060df;--praecox-calendar-focused-color:#1aff00;--praecox-calendar-adjunctive-color:rgba(85, 158, 255, 0.2);--praecox-calendar-secondary-color:rgba(86, 154, 243, 0.2);--praecox-calendar-selected-color:#0e46d4;--praecox-calendar-weekend-color:#0c0c0d;--praecox-calendar-outsidemonth-color:#5d5d63;--praecox-calendar-overbackground-color:#f5f8ff;--praecox-calendar-font-main-color:#d3d7df;--praecox-calendar-font-disabled-color:#414144;--praecox-calendar-font-secondary-color:#6c6c72;--praecox-calendar-background:#141416;--praecox-calendar-background-hover:#131f3a;--praecox-calendar-border:1px solid #3b3b3b;--praecox-calendar-boxshadow:0px 1px solid #a9a9ad;background:var(\n      --praecox-calendar-custom-background,\n      var(--praecox-calendar-background)\n    );border:var(\n      --praecox-calendar-custom-border,\n      var(--praecox-calendar-border)\n    );box-shadow:var(\n      --praecox-calendar-custom-boxshadow,\n      var(--praecox-calendar-boxshadow)\n    )}";
    	append$1(document.head, style);
    }

    function create_fragment$c(ctx) {
    	let div1;
    	let div0;
    	let calendarheader;
    	let t;
    	let calendarbody;
    	let div1_class_value;
    	let current;
    	calendarheader = new Selector({});
    	calendarbody = new CalendarBody({});

    	return {
    		c() {
    			div1 = element$1("div");
    			div0 = element$1("div");
    			create_component$1(calendarheader.$$.fragment);
    			t = space$1();
    			create_component$1(calendarbody.$$.fragment);
    			attr$1(div0, "class", "calendar-wrap");
    			attr$1(div1, "class", div1_class_value = "calendar calendar-" + /*theme*/ ctx[0] + " svelte-1gg8d67");
    		},
    		m(target, anchor) {
    			insert$1(target, div1, anchor);
    			append$1(div1, div0);
    			mount_component$1(calendarheader, div0, null);
    			append$1(div0, t);
    			mount_component$1(calendarbody, div0, null);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (!current || dirty & /*theme*/ 1 && div1_class_value !== (div1_class_value = "calendar calendar-" + /*theme*/ ctx[0] + " svelte-1gg8d67")) {
    				attr$1(div1, "class", div1_class_value);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in$1(calendarheader.$$.fragment, local);
    			transition_in$1(calendarbody.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out$1(calendarheader.$$.fragment, local);
    			transition_out$1(calendarbody.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach$1(div1);
    			destroy_component$1(calendarheader);
    			destroy_component$1(calendarbody);
    		}
    	};
    }

    function instance$b($$self, $$props, $$invalidate) {
    	let $praecoxCalendarConfig;
    	let $praecoxCalendarData;
    	const dispatch = createEventDispatcher();
    	let { nowDate = new Date() } = $$props;
    	let { lang = "en" } = $$props;
    	let { viewDate = nowDate } = $$props;
    	let { pickerRule = "single" } = $$props;
    	let { disabled = [] } = $$props;
    	let { selected = [] } = $$props;
    	let { marked = [] } = $$props;
    	let { weekNameMode = "weekAbbreviation" } = $$props;
    	let { monthNameMode = "monthFullName" } = $$props;
    	let { theme = "light" } = $$props;
    	let { reSelected = false } = $$props;
    	let { pickerDone = false } = $$props;

    	const praecoxCalendarData = writable({
    		nowDate: [],
    		viewDate,
    		action: "next",
    		flag: false,
    		view: "month",
    		monthName: monthNameMode,
    		weekName: weekNameMode,
    		lang,
    		theme,
    		pickerMode: pickerRule,
    		reselected: reSelected,
    		disabled,
    		selected,
    		focused: marked,
    		pickerDone,
    		changed: 0
    	});

    	component_subscribe($$self, praecoxCalendarData, value => $$invalidate(14, $praecoxCalendarData = value));
    	setContext("praecoxCalendarData", praecoxCalendarData);
    	let praecoxCalendarConfig = getContext("praecoxCalendarData");
    	component_subscribe($$self, praecoxCalendarConfig, value => $$invalidate(15, $praecoxCalendarConfig = value));

    	beforeUpdate(() => {
    		set_store_value(praecoxCalendarConfig, $praecoxCalendarConfig.nowDate = nowDate, $praecoxCalendarConfig);
    		$$invalidate(3, selected = $praecoxCalendarConfig.selected);
    		$$invalidate(4, pickerDone = $praecoxCalendarConfig.pickerDone);
    	});

    	$$self.$$set = $$props => {
    		if ("nowDate" in $$props) $$invalidate(5, nowDate = $$props.nowDate);
    		if ("lang" in $$props) $$invalidate(6, lang = $$props.lang);
    		if ("viewDate" in $$props) $$invalidate(7, viewDate = $$props.viewDate);
    		if ("pickerRule" in $$props) $$invalidate(8, pickerRule = $$props.pickerRule);
    		if ("disabled" in $$props) $$invalidate(9, disabled = $$props.disabled);
    		if ("selected" in $$props) $$invalidate(3, selected = $$props.selected);
    		if ("marked" in $$props) $$invalidate(10, marked = $$props.marked);
    		if ("weekNameMode" in $$props) $$invalidate(11, weekNameMode = $$props.weekNameMode);
    		if ("monthNameMode" in $$props) $$invalidate(12, monthNameMode = $$props.monthNameMode);
    		if ("theme" in $$props) $$invalidate(0, theme = $$props.theme);
    		if ("reSelected" in $$props) $$invalidate(13, reSelected = $$props.reSelected);
    		if ("pickerDone" in $$props) $$invalidate(4, pickerDone = $$props.pickerDone);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*$praecoxCalendarData*/ 16384) {
    			 if ($praecoxCalendarData.changed) dispatch("change", $praecoxCalendarData.selected);
    		}
    	};

    	return [
    		theme,
    		praecoxCalendarData,
    		praecoxCalendarConfig,
    		selected,
    		pickerDone,
    		nowDate,
    		lang,
    		viewDate,
    		pickerRule,
    		disabled,
    		marked,
    		weekNameMode,
    		monthNameMode,
    		reSelected,
    		$praecoxCalendarData
    	];
    }

    class Calendar extends SvelteComponent$1 {
    	constructor(options) {
    		super();
    		if (!document.getElementById("svelte-1gg8d67-style")) add_css$a();

    		init$1(this, options, instance$b, create_fragment$c, safe_not_equal$1, {
    			nowDate: 5,
    			lang: 6,
    			viewDate: 7,
    			pickerRule: 8,
    			disabled: 9,
    			selected: 3,
    			marked: 10,
    			weekNameMode: 11,
    			monthNameMode: 12,
    			theme: 0,
    			reSelected: 13,
    			pickerDone: 4
    		});
    	}
    }

    const isObject = val => typeof val === 'object' && val !== null;

    const isPresent = val => {

      if( typeof val === 'string' || val instanceof String ) {

        return val.trim().length > 0;

      } else if( Array.isArray(val) ) {

        return val.length > 0;

      } else if( val instanceof Date ) {

        return true;

      } else if( val instanceof File ) {

        return true;

      } else if( isObject(val) ) {

        return Object.keys(val).length > 0;

      } else {

        return val == 0 || !!val;
      }

    };

    /* App.svelte generated by Svelte v3.35.0 */

    function add_css$b() {
    	var style = element("style");
    	style.id = "svelte-2xqtjb-style";
    	style.textContent = ".wrapper.svelte-2xqtjb{display:flex;justify-content:space-around;align-items:center}";
    	append(document.head, style);
    }

    function create_fragment$d(ctx) {
    	let h1;
    	let t1;
    	let div;
    	let datepicker;
    	let current;

    	datepicker = new Calendar({
    			props: { lang: "ru", nowDate: /*nowDate*/ ctx[0] }
    		});

    	datepicker.$on("change", /*handleChangeDate*/ ctx[1]);

    	return {
    		c() {
    			h1 = element("h1");
    			h1.textContent = "Test 5";
    			t1 = space();
    			div = element("div");
    			create_component(datepicker.$$.fragment);
    			attr(div, "class", "wrapper svelte-2xqtjb");
    		},
    		m(target, anchor) {
    			insert(target, h1, anchor);
    			insert(target, t1, anchor);
    			insert(target, div, anchor);
    			mount_component(datepicker, div, null);
    			current = true;
    		},
    		p: noop,
    		i(local) {
    			if (current) return;
    			transition_in(datepicker.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(datepicker.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h1);
    			if (detaching) detach(t1);
    			if (detaching) detach(div);
    			destroy_component(datepicker);
    		}
    	};
    }

    function instance$c($$self, $$props, $$invalidate) {
    	let current_date = "2021-01-30";
    	let nowDate = current_date || new Date();
    	let selected;

    	const handleChangeDate = e => {
    		console.log("handleChangeDate", e.detail);
    		$$invalidate(2, current_date = new Date(e.detail));
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*current_date*/ 4) {
    			 console.log("current_date", current_date, selected);
    		}
    	};

    	 if (isPresent(selected)) $$invalidate(2, current_date = new Date(selected));
    	return [nowDate, handleChangeDate, current_date];
    }

    class App extends SvelteComponent {
    	constructor(options) {
    		super();
    		if (!document.getElementById("svelte-2xqtjb-style")) add_css$b();
    		init(this, options, instance$c, create_fragment$d, safe_not_equal, {});
    	}
    }

    const app = new App({
      target: document.body,
      props: {
        name: 'Datepicker',
      },
    });

    return app;

}());
//# sourceMappingURL=main.js.map
