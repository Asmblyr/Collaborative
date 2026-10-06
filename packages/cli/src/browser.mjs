import { execFile } from "node:child_process";

export async function openBrowser(url) {
  let command = "xdg-open";
  let args = [url];
  if (process.platform === "win32") {
    command = "rundll32.exe";
    args = ["url.dll,FileProtocolHandler", url];
  } else if (process.platform === "darwin") {
    command = "open";
  }
  await new Promise((resolve, reject) =>
    execFile(command, args, { windowsHide: true, timeout: 10000 }, (error) =>
      error ? reject(error) : resolve(),
    ),
  );
}
