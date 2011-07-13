var sys = require('sys');
var http = require('http');
var url = require('url');
var fs = require('fs');
var path = require('path');
var exec  = require('child_process').exec;

startTime = null;

LOGGING = false;

function resizeImage(imageName, geometry, afterResizeCallback) {
  if(!RegExp(/^[0-9x]+$/).test(geometry)) {
    throw "Can't deal with this geometry at the moment (it needs to be escaped for the FS)";
  }
  var origPath = path.join(process.cwd(), "images", "originals", imageName);
  var newPath  = path.join(process.cwd(), "images", "resized", geometry, imageName);
  var cmd = ["convert -strip -resize", geometry, origPath, newPath].join(" ");
  if (LOGGING) sys.log(cmd);
  exec(cmd, function (error, stdout, stderr) {
    if (LOGGING) {
      if (error) sys.log(error);
      sys.log(stdout);
    }
    afterResizeCallback(error);
  });
}

function sendResponse(response, statusCode, data) {
  var headers = { "Content-Type": "image/jpeg" };
  response.writeHead(statusCode, headers);
  response.write(data || "", "binary");
  response.end();
  if (LOGGING) sys.log("HTTP Status code: " + statusCode);
  if (LOGGING) sys.log("Request processed in " + (new Date().getTime() - startTime) + "ms");
}

http.createServer(function(request, response) {
  startTime = new Date().getTime();
  requestedPath = url.parse(request.url).pathname;
  if (LOGGING) sys.log("New request for image: " + requestedPath);
  
  // look for resized image
  var resizedImagePath = path.join(process.cwd(), "images", "resized", requestedPath);
  if (LOGGING) sys.log("Looking for resized: " + resizedImagePath);
  fs.readFile(resizedImagePath, function (err, data) {
    if(!err) {
      sendResponse(response, 200, data);
    } else {
      // don't have this size; look for original image
      var originalImagePath = path.join(process.cwd(), "images", "originals",
        path.basename(requestedPath));
      if (LOGGING) sys.log("Looking for original: " + originalImagePath);
      fs.readFile(originalImagePath, function (err, data) {
        if(!err) {
          // have original, make resized image and ship it
          newGeometry = path.dirname(requestedPath).split("/").pop();
          resizeImage(path.basename(requestedPath), newGeometry, function(resizeErr) {
            if (!resizeErr) {
              fs.readFile(resizedImagePath, function (err, data) {
                if (!err) {
                  sendResponse(response, 200, data);
                } else {
                  // scaling says true but can't access file
                  sendResponse(response, 500, "");
                }
              });
            } else {
              // scaling failed
              sendResponse(response, 500, "");
            }
          });
        } else {
          // don't have original, either. nothing we can do for you, buddy.
          sendResponse(response, 404, "");          
        }
      });
    }
  });
}).listen(8000);