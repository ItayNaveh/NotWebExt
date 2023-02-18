// https://firefox-source-docs.mozilla.org/devtools/backend/protocol.html
// dev-edition-default-1
// C:\Users\naveh\AppData\Roaming\Mozilla\Firefox\profiles.ini

// extension background devtools
// about:devtools-toolbox?id=99515cc94d049ba787cd5ef98e2a5075ced20953%40temporary-addon&type=extension
// about:devtools-toolbox?id=%ID%&type=extension

#![allow(dead_code, unreachable_code)]

#![feature(absolute_path)]

use serde_json::{Value, json, Map};
use tokio::join;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

fn sleep(ms: u64) -> tokio::time::Sleep { tokio::time::sleep(std::time::Duration::from_millis(ms)) }

async fn run() {
	let (tx, rx) = tokio::sync::mpsc::channel(2);
	// let (meta_tx, meta_rx) = tokio::sync::mpsc::unbounded_channel();

	notify::RecommendedWatcher::create_debounced(tx, meta_tx, std::time::Duration::from_millis(500));
	

	return;

	let port = 3333_u16;

	let extension_path = "./example_ext".to_string();

	let firefox = Box::leak(Box::new(FirefoxCxn::new(port, "dev-edition-default-1").await)) as &'static mut FirefoxCxn;

	join! {
		firefox.listen(),
		
		firefox.install_ext(extension_path),
	};

	// Saftey: join ended
	unsafe {
		// this is quite unsafe but I've derefrenced a nullptr and succeeded so who am I to judge what is unsafe
		let ptr = &mut *(firefox as *const FirefoxCxn as usize as *mut FirefoxCxn);	
		ptr.cxn.shutdown().await.unwrap();
		drop(Box::from_raw(ptr));
	}
}


use tokio::sync::Mutex;

struct FirefoxCxn {
	cxn: tokio::net::TcpStream,
	msgs: Mutex<Vec<Option<Map<String, Value>>>>,
	waiting_for: Mutex<Vec<Option<WaitingForInfo>>>,
}

impl FirefoxCxn {
	async fn new(port: u16, profile: &str) -> Self {
		std::process::Command::new("C:/Program Files/Firefox/developer/firefox.exe")
			.arg("-no-remote")
			.args(["-P", profile])
			.arg("-start-debugger-server").arg(port.to_string())
			.spawn().unwrap();
		
		let cxn = connect(port).await;

		return FirefoxCxn {
			cxn: cxn,
			msgs: Mutex::new(Vec::new()),
			waiting_for: Mutex::new(Vec::new()),
		};
	}

	async fn listen(&self) {
		let mut buf = vec![0_u8; 4096];
		loop {
			self.cxn.readable().await.unwrap();

			let read = match self.cxn.try_read(&mut buf) {
				Ok(0) => { println!("Firefox closed"); break; },
				Ok(n) => n,

				Err(e) if e.kind() == tokio::io::ErrorKind::WouldBlock => continue,
				Err(e) => panic!("Failed to read cxn: {}", e),
			};

			let buf = std::str::from_utf8(&buf[0..read]).unwrap();

			let (_size, msg) = buf.split_once(':').unwrap();
			let msg = match serde_json::from_str::<Value>(msg).unwrap() {
				Value::Object(m) => m,
				_ => panic!("Unexpected msg"),
			};

			self.msgs.lock().await.push(Some(msg));
			self.try_flush_msgs().await;
		}
	}

	async fn try_flush_msgs(&self) {
		// rust analyzer isn't the best with async stuff
		let mut waiting_for = self.waiting_for.lock().await as tokio::sync::MutexGuard<Vec<Option<WaitingForInfo>>>;
		let mut msgs = self.msgs.lock().await as tokio::sync::MutexGuard<Vec<Option<Map<String, Value>>>>;

		for waiter in waiting_for.iter_mut() {
			for msg in msgs.iter_mut() {
				let w = waiter.as_ref().unwrap();
				let m = msg.clone().unwrap();

				if w.from == m.get("from").unwrap().as_str().unwrap() {
					if (w.is_it_for_me)(&m) {
						drop(w);
						let w = waiter.take().unwrap();
						(w.on_response)(m).await;
						
						*msg = None;
						break;
					} else {
						continue;
					}
				}
			}
		}

		// retain is a mutating filter
		waiting_for.retain(|w| w.is_some());
		msgs.retain(|m| m.is_some());
	}

	async fn send_rdp_msg(&self, msg: Value) {
		let msg = msg.to_string();

		let rdp_msg = format!("{}:{}", msg.as_bytes().len(), msg);
		let to_send = rdp_msg.as_bytes();

		let mut count = 0;
		loop {
			self.cxn.writable().await.unwrap();

			count += self.cxn.try_write(&to_send[count..]).unwrap();

			if count == to_send.len() { break; }
		}
	}

	async fn install_ext(&'static self, ext_path: String) {
		self.send_rdp_msg(json!({
			"to": "root",
			"type": "getRoot",
		})).await;
		
		self.waiting_for.lock().await.push(Some(WaitingForInfo {
			from: "root".to_string(),

			is_it_for_me: Box::new(|msg| msg.contains_key("addonsActor")),

			on_response: Box::new(move |msg| Box::new(Box::pin(async move {
				let addons_actor = msg.get("addonsActor").unwrap().as_str().unwrap().to_string();

				self.send_rdp_msg(json!({
					"to": addons_actor,
					"type": "installTemporaryAddon",
					"addonPath": std::path::absolute(ext_path).unwrap().display().to_string(),
				})).await;				
			}))),
		}));

		self.try_flush_msgs().await;
	}
}

async fn connect(port: u16) -> tokio::net::TcpStream {
	// TODO: connect with retries
	sleep(3_000).await;

	let mut cxn = tokio::net::TcpStream::connect("localhost:".to_string() + port.to_string().as_str()).await.unwrap();

	let mut buf = vec![0_u8; 512];
	let read = cxn.read(&mut buf).await.unwrap();
	if read == 0 { panic!(); }

	return cxn;
}

struct WaitingForInfo {
	from: String,
	is_it_for_me: Box<dyn Fn(&Map<String, Value>) -> bool>,
	on_response: Box<dyn FnOnce(Map<String, Value>) -> Box<dyn std::future::Future<Output = ()> + Unpin>>,
}

#[tokio::main]
async fn main() {
	run().await;
}
