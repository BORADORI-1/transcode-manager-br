// vim:set ts=8 sw=4 sts=4 et ai ci nu:

const job_handler = require('../js/job.js');
const logger = require('../js/logger.js');

function regist_job(req, res)
{
    let spid = req.query.spid;
    let cpid = req.query.cpid;
    let originurl = req.query.originurl;

    let job_info = {};
    job_info.spid = spid;
    job_info.cpid = cpid;
    job_info.originurl = encodeURI(originurl);

    logger.debug('[CJ] received url = "'+req.url+'" Q="'+JSON.stringify(req.query)+'" H="'+JSON.stringify(req.headers)+'" B="'+JSON.stringify(req.body)+'"');
//    setTimeout(job_handler.regist_job_by_ftp, 0, job_info);
    job_handler.regist_job_by_ftp(job_info, regist_job_done);

    function regist_job_done(err)
    {
        let ret_code = 200;
        let ret_val = {};
        ret_val.spid = spid;
        ret_val.cpid = cpid;
        ret_val.originurl = originurl;
        if(err){
            ret_val.status = err.message;
            if(err.message == 'skip'){
                ret_code = 400;
            }else{
                ret_code = 500;
            }
            res.status(ret_code);
            res.json(ret_val);
            return;
        }
        ret_val.status = "OK";
        res.status(ret_code);
        res.json(ret_val);
    }
}


exports.regist_job = regist_job;
exports.index = function(req, res){
    res.render('index', {title: 'Express'});
};

