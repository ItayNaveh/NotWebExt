#!/usr/bin/env node
import { run } from "../build/lib.js";

// await run({
// 	firefox_bin: "C:/Program Files/Firefox/developer/firefox.exe",

// 	profile: "dev-edition-default-1",
// 	copy_profile: false,

// 	// browser_console: true,

// 	extension_path: "./example_ext/",

// 	reload_on_change: false,

// 	debug: true,
// });

await run(JSON.parse(process.argv[2]));
