import os from "os";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";

import ini from "ini";
import { log } from "../util/log.js";

const prefs = {
	"app.update.auto": false,
	"app.update.enabled": false,
	"browser.search.update": false,
	"browser.sessionstore.resume_from_crash": false,
	"browser.shell.checkDefaultBrowser": false,
	"browser.tabs.warnOnClose": false,
	"browser.startup.page": 0,
	"startup.homepage_welcome_url": "about:blank",
	"devtools.errorconsole.enabled": true,
	"extensions.logging.enabled": true,
	"extensions.update.enabled": false,
	"extensions.update.notifyUser": false,
	"prompts.tab_modal.enabled": false,
	"signon.rememberSignons": false,
	"toolkit.telemetry.enabled": false,
	"toolkit.telemetry.prompted": 2,
	"toolkit.telemetry.rejected": true,
	"javascript.options.showInConsole": true,

	"datareporting.policy.dataSubmissionEnabled": false,
	"devtools.debugger.remote-enabled": true,
	"devtools.debugger.prompt-connection": false,
	"devtools.browserconsole.contentMessages": true, // maybe i don't want this
	// "extensions.logging.enabled": false, // what should i pick
	"extensions.getAddons.cache.enabled": false,
	// "xpinstall.signatures.required": false // if i want to install extensions without signing
	"browser.startup.homepage": "about:blank", // what's the diffrence between this and browser.startup.page and startup.homepage_welcome_url
	"devtools.chrome.enabled": true,
	"datareporting.policy.firstRunURL": "",
};

export class Profile {
	tmpProfilePath?: string;

	constructor(profile: string, copy_profile: boolean) {
		if (copy_profile == true) {
			let firefoxDataDir = "";
			if (os.platform() == "win32") {
				firefoxDataDir = path.join(process.env.APPDATA!, "Mozilla", "Firefox");
			} else if (os.platform() == "linux") {
				console.warn("Haven't tested this platform yet");
				firefoxDataDir = path.join(process.env.HOME!, ".mozilla", "firefox");
			} else {
				throw new Error("Unsupported platform");
			}
	
			const profileConfigStr = fs.readFileSync(path.join(firefoxDataDir, "profiles.ini"), "utf-8");
			const profileConfig = ini.parse(profileConfigStr);

			const profileEntry = Object.values(profileConfig).find((val) => val.Name == profile);
			const profilePath = profileEntry.IsRelative == "1" ? path.join(firefoxDataDir, profileEntry.Path) : profileEntry.Path;

			this.tmpProfilePath = fs.mkdtempSync(path.join(os.tmpdir(), "firefox_temp_profile_"));
			execSync(`rmdir "${this.tmpProfilePath}"`);

			execSync(`cp -r "${profilePath}" "${this.tmpProfilePath}"`);

			// write prefs
			const content = Object.entries(prefs).reduce((acc, val) => {
				// return acc + `user_pref("${val[0]}", ${val[1]});\n`;
				
				const clean_val = typeof val[1] == "string" ? `"${val[1]}"` : val[1];
				return acc + `user_pref("${val[0]}", ${clean_val});\n`;
			}, "");

			fs.writeFileSync(path.join(this.tmpProfilePath, "user.js"), content);

			log.debug({ tmpProfilePath: this.tmpProfilePath });
		}
	}
}
