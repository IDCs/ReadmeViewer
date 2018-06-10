"use strict";
const fs = require("fs");
const path = require("path");
const React = require("react");
const vortexapi = require("vortex-api");
const ReadmeViewer = require("./views/ReadmeViewer");

const README_ATTRIB = 'readme';
const NO_README = 'No readme found';

// Used by the readme validation test to retrieve 
//  the first .txt file we find within a directory.
function filterFiles(files, callback) {
  files.filter(file => {
    if (file.indexOf('.txt') !== -1) {
      callback(file);
      return;
    }
  });
}

// We will assume that any .txt file within the mod's directory
//  is the readme file. A the callback will be called to 
//  handle the file once it's found.
function onFileChanged(event, fileName, callback) {
  if (event === 'rename') {
    const ext = path.extname(fileName).toLowerCase();
    if (ext === '.txt') {
      callback(fileName);
      return;
    }
  }
}

// Inform the watcher we no longer wish
//  to watch set paths.
function stopWatch(fsWatcher) {
  if (fsWatcher !== undefined) {
    fsWatcher.close();
    fsWatcher = undefined;
  }
}

// Function will compare the content within readme files 
//  against the stored attribute values of their specific mods.
function validateReadmeValues(state) {
  const gameId = vortexapi.selectors.activeGameId(state);

  if (gameId === undefined) {
    return Promise.reject("A game must me selected in order to access mod data!");
  }

  // Ignore any mods that are not installed or enabled.
  const mods = Object.keys(state.persistent.mods[gameId] || {})
    .filter(modId => ['enabled', 'installed'].indexOf(state.persistent.mods[gameId][modId].state) !== -1)
    .map(modId => state.persistent.mods[gameId][modId]);

  for (var key in mods) {
    var mod = mods[key];
    const attribs = mod.attributes;
    const readmeVal = vortexapi.util.getSafe(attribs, [README_ATTRIB], null);

    // Ensure that we managed to retrieve the readme attribute.
    if (readmeVal === null) {
      return Promise.reject("Cannot find the readme attribute!");
    } else {
      // Find the mod path and search the directory for the readme file.
      const installPath = vortexapi.selectors.installPath(state);
      const modPath = path.join(installPath, mod.installationPath);
      vortexapi.fs.readdirAsync(modPath).then(files => {
        filterFiles(files, function (readMe) {
          if (readMe === null) {
            // Couldn't find any txt files; check against the attrib.
            if (NO_README.localeCompare(readmeVal) !== 0)
              return Promise.reject("Readme file differs from stored attribute!");
          } else {
          // Found the readme file; read its content and compare against the attrib.
          const readmePath = path.join(modPath, readMe);
          vortexapi.fs.readFileAsync(readmePath, "utf8")
            .then(content => {
              var localReadme = content;
              if (localReadme.localeCompare(readmeVal) !== 0) {
                return Promise.reject("Readme file differs from stored attribute!");
              }
            });
          }
        });
      });
    }
  }
  Promise.resolve();
}

function init(context) {
  // Why doesn't this kick off? :(
  context.registerTest('validate-readme', 'mods-refreshed',
    () => validateReadmeValues(context.api.store.getState()));

  // Create the new readme table attribute.
  context.registerTableAttribute('mods', {
    id: README_ATTRIB,
    name: 'Readme',
    description: 'Displays readme files contained within the mod directory',
    icon: 'readme',
    customRenderer: (mod, detailCell) => {
      const gameId = vortexapi.selectors.activeGameId(context.api.store.getState());
      return (React.createElement(ReadmeViewer.default, { gameId: gameId, mod: mod }));
    },
    calc: (mod) => vortexapi.util.getSafe(mod.attributes, [README_ATTRIB], NO_README),
    placement: 'detail',
    isToggleable: false,
    isDefaultVisible: true,
    isSortable: false,
    edit: {},
  });

  context.once(() => {
    // Mods table has changed - use this to test/fix readme entries for
    //  installed mods. (Doing this because the registered test won't kick off)
    context.api.onStateChange(['persistent', 'mods'], () => {
      var state = context.api.store.getState();
      validateReadmeValues(state);
    });

    // Installation and re-installation events both emit the
    //  same event. We can use this to kick off the readme lookup.
    context.api.events.on('start-install-download', (archiveId) => {
      const state = context.api.store.getState();
      const gameId = vortexapi.selectors.activeGameId(state);

      // We need the mod's archive to retrieve its modId.
      const modArchive = state.persistent.downloads.files[archiveId] || undefined;
      if (modArchive === undefined) {
        alert("Couldn't retrieve mod archive.");
        return;
      }

      // Start the readme lookup loop.
      lookUpReadMe(gameId, modArchive, state, context);
    });
  })
}

function lookUpReadMe(gameId, modArchive, state, context) {
  const modId = modArchive.installed.modId;

  // Find the mod's installation path
  const inPaths = state.settings.mods.paths;
  const installPath = path.join(vortexapi.util.resolvePath('install', inPaths, gameId), modId) || undefined;
  if (installPath === undefined) {
    alert("No install directory?!");
    return;
  }

  // Start watching the installation path for file changes.
  vortexapi.fs.ensureDirSync(installPath);
  var fsWatcher = vortexapi.fs.watch(installPath, {}, (evt, file) => onFileChanged(evt, file, readme => {
    // We found the readme file - we can stop watching the directory.
    stopWatch(fsWatcher);

    // Read the readme file and set the readme attribute within the mod.
    var readmePath = path.join(installPath, readme);
    fs.access(readmePath, fs.constants.R_OK, (err) => {
      if (err === null) {
        return vortexapi.fs.readFileAsync(readmePath, "utf8")
          .then(content => {
            // Copy over the readme file's content
            context.api.store.dispatch(vortexapi.actions.setModAttribute(gameId, modId, README_ATTRIB, content));
            return;
          }).catch(err => {
            // The user may be re-installing the mod; Start over.
            lookUpReadMe(gameId, modArchive, state, context);
            return;
          })
      } else {
        // Couldn't read the readme file; start over.
        lookUpReadMe(gameId, modArchive, state, context);
        return;
      }
    })
  }))
  fsWatcher.on('error', err => {
    // Install path may have changed; try to look it
    //  up again. 
    lookUpReadMe(gameId, modArchive, state, context);
    return;
  })
}

exports.default = init;