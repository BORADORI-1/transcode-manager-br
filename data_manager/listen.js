// vim:set ts=8 sw=4 sts=4 et ai ci nu:
//
//
const fs = require('fs');
const express = require('express');
const path = require('path');
const http = require('http');

const Api = require('./js/Api.js');
const Dbdata = require('./js/Dbdata.js');
const logger = require('./js/logger.js');
const util = require('./js/util.js');
const routes = require('./routes');
const job_handler = require('./js/job.js');

const app = express();
const method_override = require('method-override');
/*
const async = require('async');
const url = require('url');
const querystring = require('querystring');
*/

let config;
let dbdata;
let api;
/*
var manager_config = {};
var acquire_code = 0;
*/
//let config_file = '/usr/service/etc/transcode_data_manager.json';

//var sms_admin_group = [];
let package_info;
let current_status = 0;
let child_process = [];

job_handler.prev_init();
/*
try{
    package_info = JSON.parse(fs.readFileSync('./package.json'));
}catch(e){
    console.log('Failed to read package.json '+e.toString());
    process.exit(1);
}
global.version = package_info.name+'/'+package_info.version;
*/
process.on('exit', clean_up.bind(null, {cleanup:true}));
process.on('SIGINT', clean_up.bind(null, {exit:true}));
init();
regist_callback();


return;
function clean_up(options, exit_code)
{
/*
console.log('opt = '+JSON.stringify(options));
console.log('code = '+exit_code);
    if (options.cleanup) console.log('clean');
    if (exit_code || exit_code === 0) console.log(exit_code);
    if (options.exit) process.exit();
*/
    for(let i = 0; i < child_process.length; i++){
        child_process[i].kill();
    }
    child_process = [];

    global.dbdata.end();
    global.server.close();
}
function init()
{
    let config_file = '/usr/service/etc/transcode_data_manager.json';
    let input_seq;
    if(!!process.argv[2]){
        config_file = process.argv[2];
        input_seq = process.argv[3];
    }
    global.config = config = util.read_config(config_file, input_seq);
    global.dbdata = dbdata = new Dbdata(config.smc_db);
    global.api = api = new Api();
    logger.init_logger(config);
    if(config.acquire_sequence.max){
        util.run_worker(child_process, config_file, config.acquire_sequence, true);
    }
    // Exception Handler
    process.on('uncaughtException', function (err) {
        logger.error('Caught exception: ' + err);
        if(err.stack) {
            logger.error('Stacktrace: ');
            logger.error(err.stack);
        }
        // 2015-07-08 긴급패치 jhkim
        util.smscall('[acquire] Exception Occurred CRITICAL', {group: config.default_alert_group }, null);
        process.exit(2);
    });
    app.set('port', config.listenPort || 1080);
//    app.set('views', path.join(__dirname, 'views'));
//    app.set('view engine', 'jade');
    app.set('x-powered-by', false);

    app.use(express.json());
    app.use(express.urlencoded({extended: false}));
    app.use(method_override());
    app.use(express.static(path.join(__dirname, 'public')));
    global.server = http.createServer(app);
    global.server.listen(app.get('port'), function(){
        logger.alert('data_manager has started on port ('+app.get('port')+')');
    });
}

function regist_callback()
{
    //app.get('/', routes.index);
    app.head('/', function(req, res){
        res.set({'Server':version, 'x-status':current_status});
        res.status(200);
        res.end();
    });
    app.get('/', function(req, res){
        res.end('get test');
    });
    app.get('/register_job', routes.regist_job);
}
