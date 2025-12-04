import {App, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile} from 'obsidian';
import type { Moment } from "moment";


interface DailyFolderSettings {
	format: string;
	description: boolean;
	root: string;
	useTemplate: boolean;
	template: string;
	dateFormat: string;
}

const DEFAULT_SETTINGS: DailyFolderSettings = {
	format: '',
	description: true,
	root: '',
	useTemplate: true,
	template: '',
	dateFormat: ''
};

export default class DailyNamedFolderPlugin extends Plugin {
	settings: DailyFolderSettings;

	async onload() {
		console.log('loading daily folder plugin');
		// TODO: index daily folders upon load for performance?

		await this.loadSettings();
		console.log('daily folder format parsed: ', moment().format(this.settings.format));

		// ribbon icon should do the exact same thing as the comand 'open-daily-folder' that can be triggered
		// via palette
		this.addRibbonIcon('calendar-with-checkmark', "Open today's daily note folder", () => {
			this.app.commands.executeCommandById('obsidian-daily-named-folder:open-daily-folder');
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

					// first, lets get the template (and check if it is OK)
					let template;
					if (this.settings.useTemplate) {
						// get the template content
						const templateFile = this.app.vault.getAbstractFileByPath(this.settings.template);
						if (templateFile instanceof TFile) {
							let rawTemplate = await this.app.vault.read(templateFile);
							template = this.processTemplate(rawTemplate);
						} else { // if template file has been moved/renamed/deleted
							new Notice('Oops, unable to find specified template file for daily-named-folder!');
							throw "Something went wrong trying to get the template file for daily-named-folder. " +
								"Attempted to open template at " + this.settings.template;
						}
					} else {
						template = ""; // substitute empty string as template
					}

					// then let's prompt the user for the desired folder name/description
					let folderDescription:string  = '';
					if (this.settings.description) {
						// get the folder description from a modal panel
						folderDescription = await new descriptionModal(this.app, this.settings,
							'Creating New daily folder', '');
					}

					let foldername = this.makeDailyFolderPath() + folderDescription + '/';
					let filename = this.makeDailyNoteBaseName() + folderDescription + '.md';

					// copy the template content to the new daily folder file
					// make daily directory
					await this.app.vault.createFolder(foldername);
					// make daily note inside the daily directory and  fill it with the template
					await this.app.vault.create(foldername + filename, template);
					// open the daily folder to active leaf
					await this.app.workspace.openLinkText(filename, foldername);
					// show in file explorer
					this.app.commands.executeCommandById('file-explorer:reveal-active-file');
					// we are done, so let's notify user
					new Notice('Created new daily folder');
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
		//console.log("processTemplate: " + rawTemplate);
		const template = rawTemplate.replace(/({{[^}]+}})/g, (match) => {
			// remove marker characters
			let cleaned = match.replace("{{", "").replace("}}", "");
			const parts = cleaned.split(":");
			let date = parts[0];
			if (parts.length == 0) {
				console.log("ERROR: has no date to substitute");
				return;
			}
			let dateFormat = this.settings.dateFormat;
			if (parts.length > 1) {
				dateFormat = parts[1];
			}
			while (date.indexOf(" ")>=0) {
				date = date.replace(" ", "");
			}
			// now use Moment.js to format the string
			if (date && date.length > 0 && date === 'date') {
				console.log("Uses format: " + dateFormat);
				return moment().format(dateFormat);
			} else if (date && date.length > 0 && date.startsWith("date+")) {
				date = date.replace("date+", "");
				const days = parseInt(date);
				console.log("Uses format: " + dateFormat);
				return moment().add(days, 'days').format(dateFormat);
			} else {
				console.log("Uses old formatter: " + date);
				return moment().format(date)
			}
		});
		return template
	}

	async renameDailyFolder() {
		let currentFile = this.app.workspace.getActiveFile();

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
		let currentFile = this.app.workspace.getActiveFile();
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

		let inputEl = modalContent.createEl('input', {cls: "prompt-input", type: "text",
			attr: {id: "daily-folder-input", placeholder: "Type folder name/summary..."} });

		let previewEl = modalContent.createDiv( {cls: "daily-folder-prompt-path-preview", type: "text" });
		previewEl.createSpan({cls: "daily-folder-path-preview-pre", text: "path-preview" });
		let previewTextEl = previewEl.createSpan({cls: "daily-folder-path-preview-text" });

		let instructionEl = modalContent.createDiv({cls: "prompt-instructions" });
		let hint1 = instructionEl.createDiv({cls: "prompt-instruction"});
		hint1.createSpan({cls: "prompt-instruction-command", text: "↵"});
		hint1.createSpan({text: "to confirm filename"});
		let hint2 = instructionEl.createDiv({cls: "prompt-instruction"});
		hint2.createSpan({cls: "prompt-instruction-command", text: "esc"});
		hint2.createSpan({text: "to dismiss"});

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
	plugin: DailyNamedFolderPlugin;

	constructor(app: App, plugin: DailyNamedFolderPlugin) {
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
			.setDesc("When creating daily folder, prompt for a description to be appended behind date format. " +
				"With this feature turned off, the plugin is very similar to the core daily-notes plugin.")
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
					if (await this.app.vault.adapter.exists(value) && !value.endsWith('.md')) {
						folderSetting.settingEl.removeClass('invalid-path');
						if (value.slice(-1) === '/') { value = value.slice(0, -1)} // remove trailing '/'
						console.log('Setting Daily Folder root path to: ', value);
						this.plugin.settings.root = value;
						await this.plugin.saveSettings();
					} else {
						folderSetting.setClass('invalid-path');
					}
				}));

		new Setting(containerEl)
			.setName('Enable template file')
			.setDesc("Specify a template file to be used when creating a Daily Folder. Disabling " +
				"this option will lead to an empty file being created instead."
			)
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.useTemplate)
				.onChange(async (value) => {
					this.plugin.settings.useTemplate = value;
					await this.plugin.saveSettings();

					// Re-render the settings page
					this.display();
				}));

		new Setting(containerEl)
			.setName("Date format in text")
			.setDesc("Use {{date}} template inside template file for substitution with current date")
			.addText(text => text
				.setPlaceholder('Ex: YYYYMMDD')
				.setValue(this.plugin.settings.dateFormat)
				.onChange(async (value) => {
					//console.log('[DATE FORMAT] format set: ' + value);
					this.plugin.settings.dateFormat = value;
					await this.plugin.saveSettings();
				}));

		if (this.plugin.settings.useTemplate){
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
}
