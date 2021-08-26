import {App, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile} from 'obsidian';
import type { Moment } from "moment";


interface DailyFolderSettings {
	format: string;
	description: boolean;
	root: string;
	template: string;
}

const DEFAULT_SETTINGS: DailyFolderSettings = {
	format: '',
	description: true,
	root: '',
	template: ''
};

export default class DailyFolderPlugin extends Plugin {
	settings: DailyFolderSettings;

	async onload() {
		console.log('loading daily folder plugin');
		// TODO: index daily folders upon load for performance?

		await this.loadSettings();
		console.log('daily folder format parsed: ', moment().format(this.settings.format));

		// ribbon icon should do the exact same thing as the comand 'open-daily-folder' that can be triggered
		// via palette
		this.addRibbonIcon('calendar-with-checkmark', "Open today's daily note folder", () => {
			this.app.commands.executeCommandById('obsidian-daily-folder:open-daily-folder');
		});

		this.addCommand({
			id: 'open-daily-folder',
			name: "Open today's daily folder note",
			callback: async () => {
				const dailyFolder: TFile = await this.findDailyFileIfExists();

				if (dailyFolder) {
					//open the daily note in the daily folder
					await this.app.workspace.openLinkText(dailyFolder.basename, dailyFolder.path);
					this.app.commands.executeCommandById('file-explorer:reveal-active-file'); // show in file explorer
					new Notice('Opened daily folder');
				} else {  // we have to make a new daily folder, as it does not exist yet.
					let folderDescription:string  = '';

					if (this.settings.description) {
						// get the folder description from a modal panel
						folderDescription = await new descriptionModal(this.app, this.settings,
							'Creating New daily folder', '');
					}

					let foldername = this.makeDailyFolderPath() + folderDescription + '/';
					let filename = this.makeDailyNoteBaseName() + folderDescription + '.md';

					// make daily directory
					await this.app.vault.createFolder(foldername);
					// make daily note inside the daily directory
					await this.app.vault.adapter.write(foldername + filename, '');

					// open it
					await this.app.workspace.openLinkText(filename, foldername);
					// TODO: figure out why reveal-active file doesn't work here. Maybe file not indexed yet?
					//this.app.commands.executeCommandById('file-explorer:reveal-active-file'); // show in file explorer
					// and fill it with the template
					try {
						// get the template content
						let rawTemplate = await this.app.vault.read( this.app.vault.getAbstractFileByPath(this.settings.template));
						const template = this.processTemplate(rawTemplate);
						// copy the template content to the new daily folder file
						await this.app.vault.modify( this.app.vault.getAbstractFileByPath(foldername + filename),
							template);

						// we are done
						new Notice('Created new daily folder');
					} catch (e) {
						if (e instanceof TypeError) {  // if vault.read gets a null argument
							new Notice('Problem loading template for daily folder');
							throw e
						} else {
							throw e
						}
					}
				}
			},
		});

		this.addCommand({
			id: 'next-daily-folder',
			name: "Open next daily folder note",
			callback: () => {
				this.openClosestDailyFolder(true)
			},
		});

		this.addCommand({
			id: 'prev-daily-folder',
			name: "Open previous daily folder note",
			callback: () => {
				this.openClosestDailyFolder(false);
			},
		});

		this.addCommand({
			id: 'rename-daily-folder',
			name: "Rename daily folder",
			callback: () => {
				this.renameDailyFolder();
			},
		});

		this.addSettingTab(new DailyFolderSettingTab(this.app, this));
	}

	processTemplate(rawTemplate: string): string {
		const template = rawTemplate.replace(/({{[^}]+}})/g, (match) => {
			// remove marker characters
			const cleaned = match.replace("{{","").replace("}}","").replace("date:","");
			// now use Moment.js to format the string
			return moment().format(cleaned)
		});
		return template
	}

	currentDailyFile(): TFile {
		// get the current file opened - first get the leaf
		const actLeaf = this.app.workspace.activeLeaf;
		// then get the file ( if the leaf it not null; - no leaf might be open)
		const currentFile: TFile = actLeaf ? actLeaf.view.file : null;
		return currentFile
	}

	async renameDailyFolder() {
		let currentFile = this.currentDailyFile();

		if (this.isDailyFile(currentFile)) {
			// get the date of the file we are renaming
			let currentFileDate = this.dailyFileToDate(currentFile);

			let newName = await new descriptionModal(this.app, this.settings, 'Rename daily folder',
				currentFile.basename.slice(this.settings.format.length+1, ));  // set current name as value

			// rename file
			await this.app.fileManager.renameFile(currentFile,
				currentFile.parent.path + '/' + currentFileDate.format(this.settings.format) + newName + '.md');
			// then rename the folder
			await this.app.fileManager.renameFile(currentFile.parent,
				currentFile.parent.parent.path + '/' + currentFileDate.format(this.settings.format) + newName);

			new Notice('Renamed daily folder');
		} else {  // no daily folder open in current active leafs
			new Notice('Cannot rename - no daily folder active');
		}
	}

	async openClosestDailyFolder(forward:boolean) {
		let currentFile = this.currentDailyFile();
		if (this.isDailyFile(currentFile)) {
			// get other daily folder files in vault
			let dailyFiles = this.app.vault.getMarkdownFiles().filter((file) => this.isDailyFile(file));

			// get a moment() object of the currentDailyNote for comparison
			const currentFileDate = this.dailyFileToDate(currentFile);

			// get only those after or before the currentDailyNote
			let relevantDailyFiles: TFile[] = [];
			if (forward) {
				relevantDailyFiles = dailyFiles.filter((file) => currentFileDate.isBefore(this.dailyFileToDate(file)));
			} else {
				relevantDailyFiles = dailyFiles.filter((file) => currentFileDate.isAfter(this.dailyFileToDate(file)));
			}

			// now actually open the file. First we check if there are any candidates to begin with
			if (relevantDailyFiles.length) {
				// we cannot rely on getMarkDownFiles() to return sorted list, so we must it it ourselves.
				const closest: TFile = relevantDailyFiles.reduce( (closestFile, file) => {
					const oldDiff = currentFileDate.diff(this.dailyFileToDate(closestFile));
					const newDiff = currentFileDate.diff(this.dailyFileToDate(file));
					return Math.abs(oldDiff) > Math.abs(newDiff) ? file : closestFile
				});

				await this.app.workspace.openLinkText(closest.name, closest.path)
				// TODO: find a way to only reveal the folder (but not expand it), expanding everything is a bit much
				//this.app.commands.executeCommandById('file-explorer:reveal-active-file'); // show in file explorer

			} else {  // is relevantDailyFiles is empty, there must be no more files in this 'direction'
				new Notice(`No ${forward ? 'newer' : 'older'} daily folder files.`);
			}

		} else {  // current view/file is null or not a daily folder
			new Notice('Open a daily folder file to use next/previous navigation');
		}
	}

	onunload() {
		console.log('unloading daily folder plugin');
	}

	dailyFileToDate(dailyFile: TFile) {
		return moment(dailyFile.basename.substring(0, this.settings.format.length), this.settings.format, true);
	}

	isDailyFile(mdfile: TFile) {
		let name = mdfile.basename;
		// only support fixed length Moment names (i.e. not things like 'August', only aug, or 08)
		const isValidFormat = moment(name.substring(0, this.settings.format.length), this.settings.format, true).isValid();
		if (isValidFormat) {
			//  two checks (1) name of folder matches that of file (mdfile.basename) and (2) if the daily folder
			// (mdfile.parent) is a subdirectory of the this.settings.root
			// TODO: support deeper nesting (e.g. root= 'basefolder/subfolder/')
			if (mdfile.parent.name === mdfile.basename && mdfile.parent.parent.name === this.settings.root) {
				return true
			} else {
				return false
			}
		} else {
			return false
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	makeDailyNoteBaseName() {
		return moment().format(this.settings.format)
	}

	makeDailyFolderPath() {
		return this.settings.root + '/' + this.makeDailyNoteBaseName()
	}

	async findDailyFileIfExists() {
		// the path is uncertain (we dont know what the decription that the user may have added)
		// so we just have to go search in the directory at the correct date.
		let dailyFiles = this.app.vault.getMarkdownFiles().filter((file) => this.isDailyFile(file));
		let dates = dailyFiles.map(file => file.basename.substring(0, this.settings.format.length));
		// console.log(dates);
		const currentDate = moment().format(this.settings.format);
		const fileIndex = dates.findIndex(date => date===currentDate);
		// console.log(fileIndex, '<-- fileindex')
		if (fileIndex >= 0) {
			return dailyFiles[fileIndex];
		} else {
			return null
		}
	}
}


class descriptionModal extends Modal {

	constructor(app: App, settings: Object, title: string, prevalue: string) {
		super(app);
		this.settings = settings;
		this.open();
		this.pathDescription = '';
		this.submitted = false;

		let titleEl:HTMLDivElement =  document.querySelector('.modal .modal-title');
		titleEl.innerText = title;

		let {containerEl} = this;
		let inputEl: HTMLInputElement = containerEl.querySelector('#daily-folder-input');
		let previewTextEl: HTMLSpanElement = containerEl.querySelector('.daily-folder-path-preview-text');
		inputEl.value = prevalue;

		// pre-build the display value
		previewTextEl.innerText = this.buildPathPreview(inputEl.value);

		// focus and select
		inputEl.focus();
		inputEl.select();

		// bit of a strange construction but I saw this in another obsidian plugin, so it's the best I got
		// suggestions for a nice way to get string return value from the modal appreciated.
		this.waitForClose = new Promise<string>(
			(resolve, reject) => {
				this.resolvePromise = resolve;
				this.rejectPromise = reject;
			}
		);
		return this.waitForClose;
	}

	onOpen() {
		// build the modal HTML
		let {containerEl} = this;
		let modalContent = containerEl.querySelector('.modal-content');

		let inputEl = document.createElement("INPUT");
		inputEl.setAttribute("type", "text");
		inputEl.setAttribute("placeholder", "Type folder name/summary...");
		inputEl.addClass("prompt-input");
		inputEl.id = "daily-folder-input";
		modalContent.appendChild(inputEl);

		let previewEl = document.createElement("div");
		previewEl.addClass("daily-folder-prompt-path-preview");
		let previewPreTextEl = document.createElement("span");
		previewPreTextEl.innerText = "path-preview";
		previewPreTextEl.style.whiteSpace = "nowrap";
		let previewTextEl = document.createElement("span");
		previewTextEl.addClass("daily-folder-path-preview-text");
		previewEl.appendChild(previewPreTextEl);
		previewEl.appendChild(previewTextEl);
		modalContent.appendChild(previewEl);

		let instructionEl = document.createElement("div");
		instructionEl.addClass("prompt-instructions");
		let hint1 = document.createElement("div");
		hint1.addClass("prompt-instruction");
			let instruction1 = document.createElement("span");
			instruction1.addClass("prompt-instruction-command");
			instruction1.innerText = "↵";
			hint1.appendChild(instruction1);
			let instruction1Text = document.createElement("span");
			instruction1Text.innerText = "to confirm filename";
			hint1.appendChild(instruction1Text);
		let hint2 = document.createElement("div");
		hint2.addClass("prompt-instruction");
			let instruction2 = document.createElement("span");
			instruction2.addClass("prompt-instruction-command");
			instruction2.innerText = "esc";
			hint2.appendChild(instruction2);
			let instruction2Text = document.createElement("span");
			instruction2Text.innerText = "to dismiss";
			hint2.appendChild(instruction2Text);
		instructionEl.appendChild(hint1);
		instructionEl.appendChild(hint2);
		modalContent.appendChild(instructionEl);

		// TODO think of a better way to prevent this from getting out of sync with the plugin class
		// set the initial value for preview's sake.
		previewTextEl.innerText = this.buildPath('');

		// whenever a character is changed in the input element
		inputEl.addEventListener('input', (e) => {
			previewTextEl.innerText = this.buildPathPreview(e.target.value);
		} );

		// when enter is pressed (i.e. input confirmed)
		inputEl.addEventListener('change', (e) => {this.submitDescription(e.target.value)});
	}

	buildPathPreview(inputString: string) {
		return this.settings.root + '/' + moment().format(this.settings.format) + this.buildPath(inputString)
	}

	buildPath(inputString: string): string {
		if (inputString) {
			return '_' + inputString.split(' ').join('_');
		} else {
			return ''
		}
	}

	submitDescription(description: string): void {
		this.submitted = true;
		this.pathDescription = this.buildPath(description);
		console.log('Submitting the path extension: ', this.pathDescription);
		this.close();
	}

	onClose() {
		let {containerEl} = this;
		containerEl.empty();

		if(!this.submitted) this.rejectPromise('');
		else this.resolvePromise(this.pathDescription);
	}
}

class DailyFolderSettingTab extends PluginSettingTab {
	plugin: DailyFolderPlugin;

	constructor(app: App, plugin: DailyFolderPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		let {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Folder & File Name format')
			.setDesc("Specify date format (uses Moment.js)")
			.addText(text => text
				.setPlaceholder('Ex: YYYYMMDD')
				.setValue(this.plugin.settings.format)
				.onChange(async (value) => {
					//console.log('[DAILY FOLDER] format set: ' + value);
					this.plugin.settings.format = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Prompt for filename summary')
			.setDesc("When creating daily folder, prompt for a description to be appended behind date format")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.description)
				.onChange(async (value) => {
					//console.log('[DAILY FOLDER] add description? : ' + value);
					this.plugin.settings.description = value;
					await this.plugin.saveSettings();
				}));

		let folderSetting = new Setting(containerEl)
			.setName('Daily Folders location')
			.setDesc("New daily folders will be placed in this folder. Leave empty for root.")
			.addText(text => text
				.setPlaceholder('Example: dailies/')
				.setValue(this.plugin.settings.root)
				.onChange(async (value) => {
					//console.log('[DAILY FOLDER] location set: ' + value);
					if (await this.app.vault.adapter.exists(value) && !value.contains('.md')) {
						folderSetting.settingEl.removeClass('invalid-path');
						if (value.slice(-1) === '/') { value = value.slice(0, -1)} // remove trailing '/'
						console.log('Setting Daily Folder root path to: ', value);
						this.plugin.settings.root = value;
						await this.plugin.saveSettings();
					} else {
						folderSetting.setClass('invalid-path');
					}
				}));

		let templateSetting = new Setting(containerEl)
			.setName('Template file location')
			.setDesc("Choose the file to use as a template. (must end with .md)")
			.addText(text => text
				.setPlaceholder('Example: templ/daily_log.md')
				.setValue(this.plugin.settings.template)
				.onChange(async (value) => {
					//console.log('[DAILY FOLDER] template set: ' + value);
					if (await this.app.vault.adapter.exists(value) && value.endsWith('.md')) {
						templateSetting.settingEl.classList.remove('invalid-path');
						console.log('Setting Daily Folder template to: ', value)
						this.plugin.settings.template = value;
						await this.plugin.saveSettings();
					} else {
						templateSetting.setClass('invalid-path');
					}
				}));
	}
}
