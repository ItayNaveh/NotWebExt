import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import net from "net";
import path from "path";

import { log } from "../util/log.js";

interface SpawnConfig {
	firefox_bin: string,
	profile_name?: string,
	profile_path?: string,
	browser_console: boolean,

	port: number,
};

interface IncomingRemoteMessage {
	from: string,
	[key: string]: any,
};

interface OutgoingRemoteMessage {
	to: string,
	type: string,
	[key: string]: any,
};

export const runFirefox = (config: SpawnConfig): ChildProcessWithoutNullStreams => {
	const args: string[] = [];
	
	args.push("-no-remote");
	if (config.profile_name) args.push("-P", config.profile_name);
	if (config.profile_path) args.push("-profile", config.profile_path);

	if (config.browser_console) args.push("-jsconsole");

	args.push("-start-debugger-server", config.port.toString());

	log.debug({ args });

	const subprocess = spawn(config.firefox_bin, args);
	return subprocess;
};

// TODO: order the methods good
export class Firefox {
	cxn!: net.Socket;
	extension_path!: string;
	addonsActor!: string;
	addonID?: string;
	addonActor?: string;

	constructor() {}

	private _connect(port: number): Promise<net.Socket> {
		return new Promise((resolve, reject) => {
			const cxn = net.createConnection(port);
			cxn.on("error", reject);
			cxn.once("data", (data) => {
				log.debug("initial data", data.toString());
				resolve(cxn);
			});
		});
	}

	async connectWithMaxTries(port: number, max_tries: number = 20) {
		for (let i = 0; i < max_tries; i++) {
			try {
				const cxn = await this._connect(port);
				this.cxn = cxn;
				break;
			} catch (err) {
				// @ts-ignore
				if (err.code != "ECONNREFUSED" || i == max_tries - 1) throw err;
				await new Promise(r => setTimeout(r, 100));
			}
		}

		this.cxn.on("error", (err) => {
			console.error("firefox remote err", err);
			throw err;
		});

		this.cxn.on("end", () => {
			log.print("connection ended");
		});

		this.cxn.on("data", (data) => {
			this.onData(this.parseRemoteMessage(data.toString()));
		});
	}

	onData(data: IncomingRemoteMessage) {
		switch (data.from) {
			case "root":
				if (data.addonsActor) {
					log.debug("msg from root", data);
					this.addonsActor = data.addonsActor;
	
					this.sendRemoteMessage({
						to: this.addonsActor,
						type: "installTemporaryAddon",
						addonPath: this.extension_path,
					});
				} else if (data.addons) {
					// very large so i dont print
					this.addonActor = data.addons.find((val: any) => val.id == this.addonID).actor;
				}

				break;

			case this.addonsActor:
				log.debug("msg from addons actor", data);
				if (data.error) throw new Error(data.message);

				this.addonID = data.addon.id;

				this.sendRemoteMessage({
					to: "root",
					type: "listAddons",
				});

				break;

			default:
				log.print("data at unknown actor", data);
				break;
		}
	}

	private parseRemoteMessage(data: string): IncomingRemoteMessage {
		const colonIndex = data.indexOf(":");
		
		const msgLen = data.slice(0, colonIndex);
		const msgStr = data.slice(colonIndex + 1);
		log.debug("incoming msg len", data.length, msgLen);

		const msg = JSON.parse(msgStr);

		return msg;
	}

	private sendRemoteMessage(msg: OutgoingRemoteMessage) {
		log.debug("sending", msg);
		const msgStr = JSON.stringify(msg);
		const toSend = `${Buffer.from(msgStr).length}:${msgStr}`;

		this.cxn.write(toSend);
	}

	installExtension(extension_path: string) {
		this.extension_path = path.resolve(extension_path);
		log.debug("installing", this.extension_path);

		this.sendRemoteMessage({
			to: "root",
			type: "getRoot",
		});
	}

	reloadExtension() {
		this.sendRemoteMessage({
			to: this.addonActor!,
			type: "reload",
		});
	}
}
// TODO: cleanup on firefox close (profile dir, watcher)