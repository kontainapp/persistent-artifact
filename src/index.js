const core = require('@actions/core');
const github = require('@actions/github');
const artifact_mod = require('@actions/artifact');
const config = require('./config');
const AdmZip = require('adm-zip');
//const filesize = require('filesize');
const pathname = require('path');
const fs = require('fs');

const ArtifactStatus = {
    Available: 'available',
    NotFound: 'not-found'
}

const checkArtifactStatus = async (client) => {

    let artifacts = null;

    try {
        const response = await client.paginate(
            client.rest.actions.listArtifactsForRepo,
            {
                owner: github.context.repo.owner,
                repo: github.context.repo.repo,
            }
        );
        //config.debug(`Response ${JSON.stringify(response)}`);
        config.debug(`${response.length} artifacts  found`);

        // filter array of artifacts by name
        const named_artifacts = response.filter(function (el) {
            return el.name == config.inputs.artifactName &&
                el.expired !== true
        });
        config.debug(`Artifacts with requested name  ${JSON.stringify(named_artifacts)}`);

        // sort by 'updated_at' to get latest first
        named_artifacts.sort((a, b) => Date(b.updated_at) - new Date(a.updated_at))
        config.debug(`Artifacts with requested name sorted descending ${JSON.stringify(named_artifacts)}`);

        artifacts = named_artifacts;
    } catch (error) {
        core.error(error);
    }
    return artifacts;
}

const downloadArtifact = async (client, artifacts) => {

    const files = [];
    let i = 0;

    while (i < artifacts.length) {
        try {
            config.debug(`Starting download of artifact ${artifacts[i].id}`);

            const zip = await client.actions.downloadArtifact({
                owner: github.context.repo.owner,
                repo: github.context.repo.repo,
                artifact_id: artifacts[i].id,
                archive_format: "zip",
            });
            config.debug(`Retrived zip = ${zip}`);

            const dir = config.resolvedPath;
            // make all directories
            config.debug(`Destination directory = ${dir}`);

            fs.mkdirSync(dir, { recursive: true });

            const adm = new AdmZip(Buffer.from(zip.data));
            adm.getEntries().forEach((entry) => {
                const action = entry.isDirectory ? "creating" : "inflating"
                const filepath = pathname.join(dir, entry.entryName)

                config.debug(`${action}: ${filepath}`);

                if (!entry.isDirectory) {
                    config.debug(`adding file ${filepath}`);
                    files.push(filepath);
                }
            })

            adm.extractAllTo(dir, true);
            // we succeded, no need to keep trying 
            break;
        } catch (error) {
            config.debug(`Error downloading artifact ${artifacts[i].id}: ${error} -- trying next one`);
            i++;
        }
    }
    return files;
};

const main = async () => {

    // download a single artifact
    config.debug(`Checking for ${config.inputs.artifactName}`)

    let result;

    const client = github.getOctokit(config.inputs.githubToken);

    let found = ArtifactStatus.NotFound;

    const artifacts = await checkArtifactStatus(client);

    // config.debug(`Artifact to download: ${JSON.stringify(artifact)}`);
    if (artifacts != null) {

        // download artifact
        const files = await downloadArtifact(client, artifacts);

        // the call above must return list of downloaded files withtheir absolute pathes.

        if (files.length != 0) {
            found = ArtifactStatus.Available;

            // if we got here, we have downloaded 
            //upload it back to make persistant past max days
            const artifactClient = artifact_mod.create();

            config.debug(`Files to re-upload ${JSON.stringify(files)}`);

            const uploadOptions = {
                continueOnError: true
            };

            config.debug(`updating artifact`);
            result = await artifactClient.uploadArtifact(config.inputs.artifactName, files, config.resolvedPath, uploadOptions);
            config.debug(`Upload result ${JSON.stringify(result)}`);
        }

        // try {
        //     // delete original artifact so they do not multiply
        //     result = await client.actions.deleteArtifact({
        //         owner: github.context.repo.owner,
        //         repo: github.context.repo.repo,
        //         artifact_id: artifact.id
        //     });
        // }
        // catch (error) {
        //     config.debug("Error deleting artifact");
        // }
    }

    config.debug(`Setting output to ${found}`);
    core.setOutput('artifact-status', found);

}

main();
