export const isObject = val => typeof val === 'object' && val !== null;

export const isPresent = val => {

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
