export async function runApplicationStartup(start, {
  windowRef = window,
  consoleRef = console,
} = {}){
  try{
    return await start();
  }catch(error){
    consoleRef.error('Karha application startup failed:', error);
    windowRef.dispatchEvent(new windowRef.CustomEvent('karha:startup-error', {
      detail: { error },
    }));
    throw error;
  }
}
