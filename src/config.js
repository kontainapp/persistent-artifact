const core = require('@actions/core');
const os = require('os');
const path = require('path');

class Config {
    constructor() {
        this.inputs = {
            githubToken: core.getInput('github-token',{ required: true }),
            artifactName: core.getInput('artifact-name', { required: true }),
            destinationPath: core.getInput('path', { required: true }),
            debug: core.getBooleanInput('debug'),
        };

        core.info(`Debug is set to ${this.inputs.debug}`);
        this.debug('Received inputs: ' + JSON.stringify(this.inputs));
        
        this.resolvedPath;
        // resolve tilde expansions, path.replace only replaces the first occurrence of a pattern
        if (this.inputs.destinationPath.startsWith(`~`)) {
            this.resolvedPath = path.resolve(this.inputs.destinationPath.replace('~', os.homedir()));
        } else {
            this.resolvedPath = path.resolve(this.inputs.destinationPath);
        }
        this.debug(`Resolved path is ${this.resolvedPath}`);
    }

    debug(message) {
        if (this.inputs.debug == true) {
            core.info(message);
        }   
    }

    info(message) {
        core.info(message);
    }
}

try {
    module.exports = new Config();
} catch (error) {
    core.error(error);
    core.setFailed(error.message);
}