var imagesnapjs = require('imagesnapjs');
 
imagesnapjs.capture('./public/photo.jpg', { cliflags: '-w 2'}, function(err) {
  console.log(err ? err : 'Success!');
});