/***********************
Version: 1.1
Description: Executes delta deployments from a Git Repository to Salesforce Org 
***********************/

const utils = require('./utils.js');
const KEY_FILE_LOCATION = './server.key'; //location of certificate key file in repository
const DEFAULT_LOGIN_URL = 'https://test.salesforce.com'

//load all dependencies
utils.setup();

//get arguments from command line
const args = require('minimist')(process.argv.slice(2))

const USERNAME = args['username'];
const BRANCH = args['branch'];
const DEPLOY_BRANCH = args['deployBranch']; //optional parameter to mandate which branch a pipeline is run from
const CONSUMER_KEY = args['consumerKey'];
const TOPCOMMIT = args['topCommit']; //sends infinity
let LOGIN_URL = args['loginURL'];
const CHECK_DEPLOY = args['checkDeploy'];

//validate inputs
if(!USERNAME) {utils.errorMsgAndExit('Username not passed')}
if(!BRANCH) {utils.errorMsgAndExit('Branch not passed')}
if(!CONSUMER_KEY) {utils.errorMsgAndExit('Consumer key not passed')}
if(!LOGIN_URL) {LOGIN_URL = DEFAULT_LOGIN_URL};

//If DEPLOY_BRANCH passed, check to ensure deploying from the mandated branch
if(DEPLOY_BRANCH != undefined && DEPLOY_BRANCH !== BRANCH) {
    utils.errorMsgAndExit('Deploying from incorrect branch ' + BRANCH + '. Can only deploy from ' + DEPLOY_BRANCH);
}

utils.authenticateOrg(KEY_FILE_LOCATION, CONSUMER_KEY, USERNAME, LOGIN_URL);

//get current version of the org
let previousDeployedCommitVersion = utils.getCurrentVersionFromOrg(USERNAME);
let commitVersionToDeploy = utils.getMostRecentCommitFromRepo();
 
//calculating SF-changed files (filtered only the ones of the force-app folder)
     let changedFiles = utils.getChangedFiles(previousDeployedCommitVersion, commitVersionToDeploy);
     let anyDeletedFiles = utils.anyDeletedFiles(previousDeployedCommitVersion, commitVersionToDeploy);
     let anyAddedFiles = utils.anyAddedFiles(previousDeployedCommitVersion, commitVersionToDeploy);
if(previousDeployedCommitVersion != '') {
         
        // ToDo: identify which files were deleted and which modified or Added
        
        if(changedFiles.length > 0) { 
            //if (anyDeletedFiles.length > 0){
            //    console.log('=== There are objects to Delete.'); 
                console.log('Deleting --> ' + anyDeletedFiles);
                let startDeletionTime = new Date().toISOString(); 
                utils.deleteFiles(USERNAME, CHECK_DEPLOY);
                let endDeletionTime = new Date().toISOString() - startDeletionTime;
            //    console.log('=== Deletion finished in: ' + endDeletionTime); 
            //}
            //else { 
            //    console.log('=== NO Salesforce objects to Delete.'); 
            //} 
            //if (anyAddedFiles.length > 0){
            //    console.log('=== There are objects to Add.'); 
                console.log('Adding --> ' + anyAddedFiles);
                utils.deployFiles(USERNAME, CHECK_DEPLOY);
            //    console.log('=== Adding/updating finished.'); 
            //}
            //else 
            //{ 
            //   console.log('=== NO Salesforce objects to Add.'); 
            //}      
        }
        else 
        {
            console.log('===No Salesforce objects to deploy nor delete ! '); 
        }
        
        //update commit version
        utils.updateCommitVersion(USERNAME, commitVersionToDeploy, BRANCH, changedFiles, CHECK_DEPLOY);
} else {
    //no records in Release_Log__c to upgrade from, add current version as a base to start
    utils.updateCommitVersion(USERNAME, commitVersionToDeploy, BRANCH, changedFiles, CHECK_DEPLOY);
    utils.errorMsgAndExit(`Org has no records in Release_Log__c to upgrade from. Version ${commitVersionToDeploy} added to Release_Log__c as starting point. Commit metadata changes and re-run pipline to upgrade.`);
}

utils.successMsg('Deployment => ' + commitVersionToDeploy);