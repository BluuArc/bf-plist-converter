const argv = require("yargs")
	.alias("p", "plistPath")
	.describe("p", "Path to .plist file")
	.alias("f", "plistFolderPath")
	.describe("p", "Path to folder containing plist; glob selectors will be added at the end of this string")
	.default("o", "output")
	.alias("o", "outputPath")
	.describe("o", "Path to place new folder containing output files for the given plist file")
	.alias('a', 'absolutepathtoffmpeg')
	.describe('a', 'Absolute path to the ffmpeg executable')
	.default("s", false)
	.alias("s", "skipExistingPlist")
	.describe("s", "Skip .plist files that have a folder in the output folder path")
	.argv;
const fs = require("fs");
const xmlJs = require("xml-js");
const { ungzip } = require("node-gzip");
const path = require("path");
const { glob } = require("glob");
const execa = import('execa');

async function runCommand(command = '') {
  const execaCommand = (await execa).execaCommand;
  const result = execaCommand(command);
  result.stdout.pipe(process.stdout);
  result.stderr.pipe(process.stderr);
  await result;
}

async function convertPlist(plistPath, outputPath) {
	console.log(`Processing [${plistPath}]`);
	const plistFileName = path.basename(plistPath);
	const outputFolderName = plistFileName.replace(path.extname(plistFileName), "");
	const fullOutputFolderPath = path.join(outputPath, outputFolderName);
	const outputPathExists = fs.existsSync(fullOutputFolderPath);
	if (outputPathExists && !argv.skipExistingPlist) {
		console.log(`Path [${fullOutputFolderPath}] exists. Skipping processing .plist file`);
		return;
	}

	const plistAsString = fs.readFileSync(plistPath, { encoding: "utf-8" });
	const plistAsXml = xmlJs.xml2js(plistAsString);
	const dictionaryXml = plistAsXml.elements[1] // plist entry
		.elements[0] // dict entry
		.elements; // elements in dict entry'
	const dictionaryJson = {};
	for (let i = 0; i < dictionaryXml.length; i += 2) {
		// assumption: order is name of key on first index, value of key on subsequent index
		const keyEntry = dictionaryXml[i];
		const key = keyEntry.elements[0].text;
		const valueEntry = dictionaryXml[i + 1];
		const valueTypeIsBoolean = valueEntry.name === "true" || valueEntry.name === "false";
		const value = valueTypeIsBoolean ? valueEntry.name === "true" : valueEntry.elements[0].text;
		const valueTypeIsInteger = valueEntry.name === "integer";
		// leave values of type "real" as strings to not lose accuracy
		dictionaryJson[key] = valueTypeIsInteger ? +value : value;
	}
	const { textureImageData, ...dictionaryJsonToSave } = dictionaryJson;
	if (textureImageData) {
		const imageDataAsBuffer = Buffer.from(textureImageData, 'base64');
		const result = await ungzip(imageDataAsBuffer);
		const textureFileName = dictionaryJson.textureFileName;
		const fileNameToUse = textureFileName.toLowerCase().endsWith(".tiff") ? textureFileName : `${textureFileName}.tiff`;
		const pathToOutputImage = path.join(fullOutputFolderPath, fileNameToUse);
		if (!outputPathExists) {
			// wait until we're ready to write files to create the folder for easier re-runnning on errors
			fs.mkdirSync(fullOutputFolderPath);
		}
		fs.writeFileSync(pathToOutputImage, result);
		const lowerCaseFileName = textureFileName.toLowerCase();
		if (!lowerCaseFileName.endsWith(".tiff") && !lowerCaseFileName.endsWith(".plist")) {
			// convert TIFF to PNG
			const ffmpegPath = path.normalize(argv.absolutepathtoffmpeg);
			await runCommand([
				ffmpegPath,
				`-i ${pathToOutputImage}`,
				`${path.join(fullOutputFolderPath, textureFileName)}`,
				'-y', // override existing file
			].join(' '));
		} else if (lowerCaseFileName.endsWith(".plist")) {
			// re-use existing file name - ex: effect_prt_1011_black_re2
			fs.writeFileSync(path.join(fullOutputFolderPath, textureFileName), result);
		}
	} else if (!outputPathExists) {
		// wait until we're ready to write files to create the folder for easier re-runnning on errors
		fs.mkdirSync(fullOutputFolderPath);
	}
	fs.writeFileSync(path.join(fullOutputFolderPath, "data.json"), JSON.stringify(dictionaryJsonToSave, null, "\t"), { encoding: "utf8" });

	console.log("Wrote files to", fullOutputFolderPath);
}

async function main() {
	const { plistPath, plistFolderPath, outputPath } = argv;
	const hasSinglePlist = fs.existsSync(plistPath);
	const hasMultiplePlist = fs.existsSync(plistFolderPath);
	if (!hasSinglePlist && !hasMultiplePlist) {
		throw new Error(`No file found at [plistPath=${plistPath}] and no directory found at [plistFolderPath=${plistFolderPath}]`);
	}
	if (!fs.existsSync(outputPath)) {
		throw new Error(`Cannot find path for output [${outputPath}]`);
	}
	if (hasSinglePlist) {
		await convertPlist(plistPath, outputPath);
	}

	if (hasMultiplePlist) {
		const forwardSlashPath = plistFolderPath.replace(/\\/g, "/");
		const plistFiles = await glob(`${forwardSlashPath}/**/*.plist`);
		console.log(`Found ${plistFiles.length} plist files at [plistFolderPath=${forwardSlashPath}]`);
		for (const entry of plistFiles) {
			await convertPlist(entry, outputPath);
		}
	}
}

main();