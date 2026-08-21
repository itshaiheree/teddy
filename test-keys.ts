import * as readline from "readline";

console.log("Press keys to see their codes (Ctrl+C to exit):\n");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

process.stdin.setRawMode(true);
process.stdin.resume();

process.stdin.on("data", (data: Buffer) => {
  const str = data.toString();
  console.log(`Received: "${str}" | charCode: ${str.charCodeAt(0)} | hex: ${data.toString('hex')}`);
  
  if (str === "\x03") { // Ctrl+C
    process.stdin.setRawMode(false);
    process.exit(0);
  }
});

// Keep the process alive
setInterval(() => {}, 1000);