import net from "net";

export const getFreePort = (): Promise<number> => {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.listen(0, "127.0.0.1", () => {
			// @ts-ignore
			const port = server.address().port;
			server.close(() => resolve(port));
		});
	});
};
