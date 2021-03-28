<script>
  import Datepicker from "../src/Calendar.svelte";
  import { isPresent } from "./tools.js";

  let selected = (new Date("2021-06-5")).getTime();

  const handleChangeDate = e => console.log('handleChangeDate', new Date(e.detail));

  // $: console.log('selected', selected)
  // $: if( isPresent(selected) ) current_date = new Date(selected)
  $: console.log('selected', selected)

</script>

<h1>Test 5</h1>

<button on:click={ e => selected = (new Date("2021-03-31")).getTime() }>Assign selected</button>

<div class="wrapper">
	<Datepicker
    lang="ru"
    nowDate={ selected }
    bind:selected
    on:change = { handleChangeDate }
	/>
</div>

<style>
	.wrapper {
		display: flex;
    justify-content: space-around;
    align-items: center;
	}
</style>
