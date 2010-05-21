var sys = require('sys');
var http = require('http');
var url = require('url');
var fs = require('fs');
var path = require('path');
var exec  = require('child_process').exec;

function resizeImage(imageName, geometry) {
  if(!RegExp(/^[0-9x]+$/).test(geometry)) {
    throw "Can't deal with this geometry at the moment (it needs to be escaped for the FS)";
  }
  var origPath = path.join(process.cwd(), "images", "originals", imageName);
  var newPath  = path.join(process.cwd(), "images", "resized", geometry, imageName);
  var cmd = ["convert -resize", geometry, origPath, newPath].join(" ");
  sys.log(cmd);
  exec(cmd, function (error, stdout, stderr) {
    return (error == null);
  });
}

function sendResponse(response, statusCode, data) {
  var headers = { "Content-Type": "image/jpeg" };
  response.writeHead(statusCode, headers);
  response.write(data || "", "binary");
  response.end();
  sys.log("HTTP Status code: " + statusCode);
}

http.createServer(function(request, response) {
  requestedPath = url.parse(request.url).pathname;
  sys.log("New request for image: " + requestedPath);
  
  // look for resized image
  var resizedImagePath = path.join(process.cwd(), "images", "resized", requestedPath);
  sys.log("Looking for resized: " + resizedImagePath);
  fs.readFile(resizedImagePath, function (err, data) {
    if(!err) {
      sendResponse(response, 200, data);
    } else {
      // don't have this size; look for original image
      var originalImagePath = path.join(process.cwd(), "images", "originals",
        path.basename(requestedPath));
      sys.log("Looking for original: " + originalImagePath);
      fs.readFile(originalImagePath, function (err, data) {
        if(!err) {
          // have original, make resized image and ship it
          newGeometry = path.dirname(requestedPath).split("/").pop();
          if (resizeImage(path.basename(requestedPath), newGeometry)) {
            fs.readFile(originalImagePath, function (err, data) {
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
        } else {
          // don't have original, either. nothing we can do for you, buddy.
          sendResponse(response, 404, "");          
        }
        
      });
    }
  });
}).listen(8000);