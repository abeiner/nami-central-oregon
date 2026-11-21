const {BlobStore} = require("../store");
const {createService} = require("../service");
const {createHandler} = require("../handler");
let handler;
module.exports = async function(context, req) {
  if (!handler) {
    if (!process.env.SPONSOR_BLOB || !process.env.ADMIN_KEY || !process.env.PUBLIC_ORIGIN) {
      context.res={status:503,body:{error:"Sponsorship storage is not configured."}};
      return;
    }
    const service=createService(new BlobStore(process.env.SPONSOR_BLOB),{demo:process.env.SPONSOR_DEMO !== "0",origin:process.env.PUBLIC_ORIGIN});
    handler=createHandler(service,process.env.ADMIN_KEY);
  }
  const result=await handler(req);
  context.res={...result,body:typeof result.body === "object" && result.body !== null && !Buffer.isBuffer(result.body) ? JSON.stringify(result.body) : result.body};
};

