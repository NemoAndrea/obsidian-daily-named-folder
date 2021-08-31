## Obsidian Daily Named Folder Plugin

A community plugin for [Obsidian](https://obsidian.md/). 

the `daily-named-folder` plugin is exactly like the official `daily-note` plugin, **except** for the fact (1) that the daily note is created **inside it's own folder** and **(2) a one-line description is added to the filename.** This is desirable if you want to keep attachments for the daily note in separate folders.

> It is possible to create daily folders using the core `daily-notes` plugin. Currently (as of 2021-08-31) this will break the 'previous/next' navigation hotkeys, but if that is not a problem and you don't *want* **named** folders, it is recommended you use that over this plugin.

> Using this plugin will (probably) not work with other plugins such as `Calendar` that rely on the default implementation in `daily-notes` and will get upset by the named folders.

![apple](https://i.imgur.com/RWckxI8.gif)

The plugin implements most of the nice features of the `daily-notes` plugin and adds a few new ones

* Previous/Next daily note navigation. *Will find the nearest previous/next node - no need to worry about missed days.*
* Smart new daily note: the `today's daily folder` function will create a new daily note **or, if a file already exists, open up the existing file.** 
* Template selection. Specify a template markdown file to be used when a new daily note is created. Arguments between `{{ }}` will be parsed by `Moment.js`. 
* `Moment.js` date formatting for filenames
* Path checking in the plugin configuration menu. Get immediate feedback if you mistyped your path.
* Filename descriptions. Add a brief description to each daily note that is appended after the date. Useful for quickly summarising a document and to speed up navigation.

### Functions

The plugin exposes 4 new functions to the Obsidian `command pallette`:

1. `Rename daily folder` - if a daily folder is active (i.e. open), it will open a rename dialog. Will rename both the folder and the note (which have the same name)

2. `Open next daily folder note` - if a daily folder is active (i.e. open), it will open the *nearest* daily note with a later date. Will notify user if there are no newer files

3. `Open previous daily folder note` - same as (2) but for older files

4. `Open Today's daily folder note` - Creates a new daily folder note (filled with template)  if none exists. If a daily folder note already exists, it will open the existing one instead. Serves to quickly make or get to today's note.

   > This function is also added as a ribbon icon  (i.e. as an icon to the left sidebar)  for quick access.

### Configuration

There are 4 configuration options

1. `Folder & Name format` - the date format that will be the base of the daily folder (and file) name. Follows Moment.js format rules

2. `Prompt for filename summary` - toggle value. If enabled, the plugin will prompt for a filename summary when creating a new note. If turned off it will just use the `folder & name format` for filename creation. 

   > E.g. `20210801`  with prompt off, with prompt on you can get something like  `20210801_getting_a_new_puppy`

   > If you find yourself turning this feature off, ask yourself if the standard `daily-notes` core plugin also works for your use case. If you specify a daily folder path as e.g.`YYYYMMDD/YYYYMMDD` it will create a daily folder with that format. So that is completely identical to this plugin with this feature turned off! The only reason why you would use this currently is because the `daily-notes` plugin's 'previous/next' navigation breaks, while this plugin has no problems with that. I think that should be considered a bug and might be fixed in the future!

3. `Daily folders location`  - the root directory for new daily folders. **Does not support nesting currently**

4. `Template filee location` - the path to the markdown file to use as template. Supports Moment.js variables.  

### Example use case

I developed the plugin for my workflow. I use Obsidian as my lab journal for research. In this workflow I write down experiments done during the day, reference prior results a lot and include experimental images. 

The official `daily-note` plugin did not work for this workflow for 2 reasons:

1. It is not possible to keep images for a daily note together with the daily file in one folder **and retain previous/next shortcuts.**

   > Being able to find images quickly is helpful if one intends to use them for other display purposes (e.g. in making a presentation, sending to a collaborator)

2. It is not possible to quickly add a brief description to the daily note filename (it is always just a date)

   > While obsidian makes it much easier to navigate, it still cannot beat a oneline summary. It also makes your daily notes easier to understand for someone *not* using obsidian

### TODO

There are a few things that could be made more robust

1. The current date format only supports 'fixed-length' formats. So nothing like fully month names, as their length is not fixed `e.g. 'august' vs 'may'` 
2. The `reveal-active-file` in file explorer doesn't work when just creating a new daily note. I think it may be related to the file-explorer not having indexed the file. Probably an easy fix, suggestions welcome.
3. At the moment, the next-and-previous daily note navigation searches through all the markdown files in the vault. I don't know how well this will scale with vault size. So far with 200 files this is not a problem, but if this becomes  a problem, the plugin may have to switch to getting a list upon load, rather than sorting through all files every time. 
4. Currently, deep nesting is not supported. So you can put your daily folders in the folder `dailies/` but not in `dailies/botany/jungle-tour/` . Not a difficult fix.
5. Figure out a nice way to expand the 'active' file during the previous/next navigation **while** closing the other daily files. One wouldn't want to 'unfold' all the folders in the file-explorer, but it is also annoying that you cannot see  the 'context' in the file explorer currently. Would probably require some decently complex system involving `file-explorer:reveal-active-file`



