import fs from "fs";

import { log } from "../util/log.js";
import { Profile } from "../util/profile.js";
import { getFreePort } from "../util/port.js";
import { runFirefox, Firefox } from "../util/firefox.js";
import { debounce } from "../util/debounce.js";

interface RunOptions {
	firefox_bin?: string,
	profile: string,
	copy_profile?: boolean,
	browser_console?: boolean,
	extension_path: string,
	reload_on_change?: boolean,

	tabs?: string[],

	debug: boolean,
};

const exec = async(options: RunOptions) => {
	options.firefox_bin ?? (options.firefox_bin = "firefox");
	options.copy_profile ?? (options.copy_profile = true);
	options.browser_console ?? (options.browser_console = false);
	options.reload_on_change ?? (options.reload_on_change = false);

	options.tabs ?? (options.tabs = []);
	
	options.debug ?? (options.debug = false);
	if (options.debug) log.debug = console.log;
	

	log.debug(options);


	const profile = new Profile(options.profile, options.copy_profile);

	const port = await getFreePort();
	log.print("Using port: ", port);

	
	const subprocess = runFirefox({
		firefox_bin: options.firefox_bin,

		...(options.copy_profile ?
			{ profile_path: profile.tmpProfilePath } :
			{ profile_name: options.profile }
		),

		browser_console: options.browser_console,
		tabs: options.tabs,

		port: port,
	});

	await new Promise((res) => setTimeout(res, 500));

	const firefox = new Firefox();
	await firefox.connectWithMaxTries(port);

	await firefox.installExtension(options.extension_path);

	let needToStopWatcher = false;
	let stopWatcherFn: () => void;

	let needToCleanProfile = options.copy_profile;

	if (options.reload_on_change == true) {
		const watcher = fs.watch(options.extension_path);
		watcher.on("change", debounce((type: string, file: string) => {
			log.print("Reloading", { type, file });
			firefox.reloadExtension();
		}));
		
		needToStopWatcher = true;
		stopWatcherFn = watcher.close;
	}

	const cleanup = async() => {
		if (needToCleanProfile == true) {
			needToCleanProfile = false;
			const { execSync } = await import("child_process");
			execSync(`rm -r "${profile.tmpProfilePath}"`);
		}

		if (needToStopWatcher == true) {
			needToStopWatcher = false;
			stopWatcherFn();
		}
	};

	process.on("exit", cleanup);
	subprocess.on("close", () => { log.print("firefox closed"); cleanup(); });
};

export default exec;
