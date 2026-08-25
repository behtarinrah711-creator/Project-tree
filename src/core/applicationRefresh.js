export function createApplicationRefresh(){
  let renderer = null;
  let pending = false;

  function request(){
    if(typeof renderer === 'function') return renderer();
    pending = true;
    return false;
  }

  function register(nextRenderer){
    if(typeof nextRenderer !== 'function') throw new TypeError('application refresh renderer must be a function');
    renderer = nextRenderer;
    if(pending){
      pending = false;
      return renderer();
    }
    return true;
  }

  return Object.freeze({ request, register });
}

export const applicationRefresh = createApplicationRefresh();
