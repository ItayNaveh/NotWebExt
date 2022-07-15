import fs from "fs";
import path from "path";

const copyFileSync = (source: string, target: string) => {
	let targetFile = target;

	// If target is a directory, a new file with the same name will be created
	if (fs.existsSync(target) && fs.lstatSync(target).isDirectory()) {
		targetFile = path.join(target, path.basename(source));
	}

	// fs.writeFileSync(targetFile, fs.readFileSync(source));
	fs.copyFileSync(source, targetFile);
}

export const copyFolderRecursiveSync = (source: string, target: string) => {
	let files = [];

	// Check if folder needs to be created or integrated
	const targetFolder = path.join(target, path.basename(source));
	if (!fs.existsSync(targetFolder)) {
		fs.mkdirSync(targetFolder);
	}

	// Copy
	if (fs.lstatSync(source).isDirectory()) {
		files = fs.readdirSync(source);
		// files.forEach( function ( file ) {  } );
		for (const file of files) {
			const curSource = path.join(source, file);
			if (fs.lstatSync(curSource).isDirectory()) {
				copyFolderRecursiveSync(curSource, targetFolder);
			} else {
				copyFileSync(curSource, targetFolder);
			}
		}
	}
}

// import fs from "fs";
// import path from "path";

// export const copyDirRecursevly = (src, target) => {
//     console.log("copy", { src, target })
//     if (!fs.existsSync(target)) {
//         fs.mkdirSync(target);
//     }

//     const entries = fs.readdirSync(src, { withFileTypes: true });
//     // console.log(src, target, entries);

//     for (const entry of entries) {
//         if (entry.isDirectory()) {
//             copyDirRecursevly(path.join(src, entry.name), path.join(target, entry.name));
//         } else {
//             fs.copyFileSync(path.join(src, entry.name), path.join(target, entry.name));
//         }
//     }
//     // console.log("done copying");
// };

// export const removeDirRecursevly = (target, inside = false) => {
//     const entries = fs.readdirSync(target, { withFileTypes: true });
//     // console.log(target, entries);

//     for (const entry of entries) {

//         if (entry.isDirectory()) {
//             if (fs.readdirSync(path.join(target, entry.name)).length != 0) {
//                 removeDirRecursevly(path.join(target, entry.name), true);
//             }
//             fs.rmdirSync(path.join(target, entry.name));
//         } else if (entry.isFile()) {
//             fs.rmSync(path.join(target, entry.name));
//         } else {
//             throw new Error("unknow file type", entry);
//         }
//     }

//     if (inside == false) fs.rmdirSync(target);
//     // console.log("done removing");
// };
