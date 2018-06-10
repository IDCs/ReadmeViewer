"use strict";
const React = require("react");
const vrtx = require("vortex-api");
const redux = require("react-redux");

const TEXTAREA_COLS = 40;
const TEXTAREA_ROWS = 4;
const README_ATTRIB = 'readme';
const NO_README_FOUND = 'No readme found';

class ReadmeViewer extends vrtx.ComponentEx {
  constructor(props) {
    super(props);
    this.initState({
      // Attempt to retrieve the readme value.
      valueCache: this.getValue(props),
    });
  }

  // Create a textarea to display the readme file.
  render() {
    const { mod } = this.props;
    const { valueCache } = this.state;
    return (React.createElement("textarea", {
      value: valueCache !== null ? valueCache : '',
      cols: TEXTAREA_COLS,
      rows: TEXTAREA_ROWS,
      id: mod.id,
      className: 'textarea-readme',
      readonly: true
    }));
  }

  getValue(props) {
    return vrtx.util.getSafe(props.mod.attributes, [README_ATTRIB], NO_README_FOUND);
  }
}

function mapStateToProps(state) {
  return {};
}

function mapDispatchToProps(dispatch) {
  return {};
}

exports.default = redux.connect(mapStateToProps, mapDispatchToProps)(ReadmeViewer);
