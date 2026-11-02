import { runBounded } from './probe.js';
import { terminalExecutable } from './terminal-host.js';
import { ControlError } from './schema.js';

// Fixed native dialogs only. Browser input never becomes a command or a script.
export function pickerArguments(platform:NodeJS.Platform){
  if(platform==='darwin')return ['-e','try\nreturn POSIX path of (choose folder with prompt "Choose a project for Shrinkcage")\non error number -128\nreturn ""\nend try'];
  if(platform==='win32')return ['-NoProfile','-STA','-Command',`$ErrorActionPreference = 'Stop'; Add-Type -AssemblyName System.Windows.Forms; [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); $dialog = New-Object System.Windows.Forms.FolderBrowserDialog; $dialog.Description = 'Choose a project for Shrinkcage'; $dialog.ShowNewFolderButton = $false; try { if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::WriteLine($dialog.SelectedPath) } } finally { $dialog.Dispose() }`];
  return ['--file-selection','--directory','--title=Choose a project for Shrinkcage'];
}

export async function pickProjectDirectory(env:NodeJS.ProcessEnv=process.env):Promise<string|null>{
  if(process.platform==='linux'&&!env.DISPLAY&&!env.WAYLAND_DISPLAY)throw new ControlError('No desktop is available for a folder picker. Use Enter a folder path instead.');
  let binary=await terminalExecutable(process.platform==='darwin'?'osascript':process.platform==='win32'?'powershell.exe':'zenity',env);
  let args=pickerArguments(process.platform);
  if(!binary&&process.platform==='linux'){binary=await terminalExecutable('kdialog',env);args=['--getexistingdirectory',env.HOME??'/','--title','Choose a project for Shrinkcage'];}
  if(!binary)throw new ControlError('The native folder picker is unavailable. Use Enter a folder path instead.');
  let result;try{result=await runBounded(binary,args,{env,timeout:120000});}catch{throw new ControlError('The folder picker could not finish. Try again or enter a folder path.');}
  if(result.code===1&&process.platform==='linux'&&!result.stderr.trim())return null;
  if(result.code!==0)throw new ControlError('The folder picker could not open. Check desktop permissions or enter a folder path.');
  return pickerSelection(result.stdout);
}

export function pickerSelection(output:string):string|null{
  // Remove the command's line ending only; spaces can belong to the folder name.
  const path=output.replace(/\r?\n$/,'');if(!path)return null;
  if(path.length>4096||/[\0\r\n]/.test(path))throw new ControlError('Choose a single local project folder.');
  return path;
}
