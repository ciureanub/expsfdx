//require libraries
const shell = require('shelljs');
const path = require('path');

//console colours
const CONSOLE_RED = '"\x1b[31m"';
const CONSOLE_GREEN = "\x1b[32m";

//list any cmd dependencies that need to be initially run
const DEPENDENCIES = ['npm i minimist'];

//temp folder to be used to hold the deployment files
const DEPLOY_FOLDER = 'deploy';
var fileList = '';

//initialise any prerequisite
module.exports.setup = function () { 
    DEPENDENCIES.forEach((dependency) => {
        this.executeCmd(dependency, true);
    })
}

//initialise any prerequisite
module.exports.authenticateOrg = function (keyFile, consumerKey, username, loginURL) { 
    let authenticate = `sfdx force:auth:jwt:grant -f ${keyFile} -i ${consumerKey} -u ${username} -d -s -r ${loginURL}`;

    this.executeCmd(authenticate, true);
}

//get the commit version the org is currently on
module.exports.getCurrentVersionFromOrg = function (username) { 
    var lastCommitVersion = '';

    //query the Release_Log__c for last deployed commit version
    let getReleaseLog = `sfdx force:data:soql:query -q "Select Commit__c from Release_Log__c Order By Deployment_Date__c DESC limit 1" --targetusername ${username} --json`;
    let outputReleaseLog = this.executeCmd(getReleaseLog, true);

    let objJSON = JSON.parse(outputReleaseLog);

    if(objJSON.status !== 0) {
        this.errorMsgAndExit('Release_Log__c SOQL failed - ' + objJSON.message)
    } else if(objJSON.result.records.length > 0) {
        //extract the commit version from the result
        lastCommitVersion = objJSON.result.records[0].Commit__c;
    }
    return lastCommitVersion
};


module.exports.getMostRecentCommitFromRepo = function () { 
    //get latest commit to deploy from current branch
    let getMostRecentCommit = `git rev-parse --short HEAD`;
    let outputMostRecentCommit = this.executeCmd(getMostRecentCommit, true);

    outputMostRecentCommit = outputMostRecentCommit.trim();

    return outputMostRecentCommit;
};

// core.abbrev needs alignment: under .git/config - add abbrev = 8 under [core] section
//get list of files to deploy between 2 commit versions
module.exports.getChangedFiles = function (versionFrom, topCommit) { 
    //get all files changed since a commit version
    console.log('=== Creating delta and writing files to package and/or destructiveChanges folders');

    console.log("=== vFrom= " + versionFrom + " vTO-TopCommit= " + topCommit);
    
    shell.exec(`sfdx sgd:source:delta --to ${topCommit} --from ${versionFrom} --output .`);
    shell.exec(`ls`);
    console.log('--- package.xml generated with added and modified metadata ---');
    shell.exec(`cat package/package.xml`);
    shell.ls();
    console.log('--- destructiveChanges.xml generated with deleted metadata ---');
    shell.exec(`cat destructiveChanges/destructiveChanges.xml`);
    
    let getFileChanges = `git diff --name-only ${versionFrom} ${topCommit}`;

    let outputChangedFiles = this.executeCmd(getFileChanges, true);

    //each file is on a new line, create array of the different files jjrtmr
    let changedFiles = outputChangedFiles.split("\n");

    //clean out any non deployable files
    var changedFilesCleaned = changedFiles.filter(function (filename) {
        return filename.includes('force-app/main/default');
    });

    // changed files as from under the force-app folder ! 
    return changedFilesCleaned;
};

//git log --diff-filter=D --summary  5f6258e9 9425c17 | grep 'delete mode'
module.exports.anyDeletedFiles = function (versionFrom, topCommit) { 

    console.log('=== Looking for deleted files, if any.');
    console.log("=== vFrom= " + versionFrom + "     vTO-TopCommit= " + topCommit);
    //let deletedFiles = `git log --diff-filter=D --summary ${versionFrom} ${topCommit}`;

    let deletedFiles = `git diff --name-status ${versionFrom}..${topCommit}`;
    let outputDeletedFiles = this.executeCmd(deletedFiles, true);

    let deletedFilesSplit = outputDeletedFiles.split("\n");

    var outputDeletedFilesFiltered = deletedFilesSplit.filter(function (filename) {
        //return filename.includes('delete mode');
        return filename.includes('force-app/');
    });

    return outputDeletedFilesFiltered;
};

module.exports.anyAddedFiles = function (versionFrom, topCommit) { 

    console.log('=== Looking for added files, if any. ');
    console.log("=== vFrom= " + versionFrom + " vTO-TopCommit= " + topCommit);
    //let addedFiles = `git log --diff-filter=A --summary ${versionFrom} ${topCommit}`;
    let addedFiles = `git diff --name-status ${versionFrom}..${topCommit}`;

    let outputAddedFiles = this.executeCmd(addedFiles, true);
   
    let addedFilesSplit = outputAddedFiles.split("\n");

    var outputAddedFilesFiltered = addedFilesSplit.filter(function (filename) {
        //return filename.includes('create mode');
        //return filename.includes('M	force-app/') || filename.includes('A	force-app/') || filename.includes('R064	force-app/');
        return filename.includes('force-app/');
    });

    return outputAddedFilesFiltered;
};

//copy required files into a new deployment folder
/*module.exports.createDeploymentFolder = function (filesToDeploy) {
    console.log('=== Copying files to deploy');
    //loop through each file and copy to a new deployment folder
    filesToDeploy.forEach((file) => {
        let fileDeployLocation = DEPLOY_FOLDER + '/' + file;

        //create folder for file
        shell.mkdir('-p', path.dirname(fileDeployLocation));

        //copy file over
        console.log('copying --> ' + fileDeployLocation);
        shell.cp('-rn', file, fileDeployLocation);

        //if LWC or Aura, need whole folder
        if(file.includes('force-app/main/default/lwc/') || file.includes('force-app/main/default/aura/')) {
            //loop each file in the folder and copy it
            shell.ls(path.dirname(file + '/*')).forEach((copyFile) => {
                shell.cp('-rn', copyFile, DEPLOY_FOLDER + '/' + copyFile);
            });
        } else if (shell.test('-f', file + '-meta.xml')) { //check for associated -meta.xml file to add
            console.log('copying --> ' + fileDeployLocation + '-meta.xml');
            shell.cp('-rn', file + '-meta.xml', fileDeployLocation + '-meta.xml');
        }
    });
};*/ 

//deploy to Org
module.exports.deployFiles = function (username, checkDeploy) {
    let cmdCheckDeploy = '';

    //deploy or delete the files from the Org (or validate if checkDeploy is 'yes')
    if(checkDeploy === 'yes') {
        cmdCheckDeploy = '--checkonly';
    }

    let deployFiles = `sfdx force:source:deploy -x package/package.xml --targetusername ${username} ${cmdCheckDeploy} --verbose --testlevel RunLocalTests`;

    console.log('=== Deploying');

    this.executeCmd(deployFiles, false);
};

module.exports.deleteFiles = function (username, checkDeploy) {
    let cmdCheckDeploy = '';

    //run a check only deploy, allowing a quick check/delete
    if(checkDeploy === 'yes') {
        cmdCheckDeploy = '--checkonly';
    }

    let deletedFiles = `sfdx force:mdapi:deploy -d destructiveChanges -g -o --targetusername ${username} ${cmdCheckDeploy} --verbose --wait 0`;

    this.executeCmd(deletedFiles, false);    
}

//update commit version to Org
module.exports.updateCommitVersion = function (username, commitVersion, branch, changedFilesCleaned, checkDeploy) {
    let deploymentDate = new Date().toISOString();
    
    let changedFiles = changedFilesCleaned.toString().replace(",", "\n");

    changedFilesCleaned.forEach((changedFile) => {
        fileList = fileList + changedFile + "\n";        
    });
    console.log('File# --> ' + fileList);
    console.log('=== End of FileList.'); 

    if(checkDeploy === 'no') {
        console.log('=== Creating a Release_Log entry in the Org.'); 
        let updateCommitVersion = `sfdx force:data:record:create -s Release_Log__c -v "Commit__c='${commitVersion}' Branch__c='${branch}' Deployment_Date__c='${deploymentDate}' Deployed_Files__c='${fileList}'" --targetusername ${username}`;
                    //WORKS: sfdx force:data:record:create -s Release_Log__c -v "Commit__c='ab2ab72f' Branch__c='master' Deployment_Date__c='2022-01-30T17:27:42.000+0000' Deployed_Files__c='null'" --targetusername ciureanub@yahoo.com.full
        console.log('=== Done creating a Release_Log entry in the Org.'); 
        this.executeCmd(updateCommitVersion, false);
    }
};

//execute a CLI command
module.exports.executeCmd = function (cmd, silent) {
    console.log(cmd);

    var params = {};
    if(silent) { params.silent = true; }

    const { stdout, stderr, code } = shell.exec(cmd, params);

    if(code === 0) {
        return stdout;
    } else {
        this.errorMsgAndExit(stderr);
    }
};

//update commit version to Org
module.exports.errorMsgAndExit = function (message) {
    console.log(CONSOLE_RED, '=== ERROR: ' + message);
    process.exit(1);
};

//update commit version to Org
module.exports.successMsg = function (message) {
    console.log(CONSOLE_GREEN, '=== SUCCESS: ' + message);
};
