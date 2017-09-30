var gulp        = require('gulp'),
	plumber     = require('gulp-plumber'),
	browserSync = require('browser-sync'),
	stylus      = require('gulp-stylus'),
	uglify      = require('gulp-uglify'),
	concat      = require('gulp-concat'),
	jeet        = require('jeet'),
	rupture     = require('rupture'),
	koutoSwiss  = require('kouto-swiss'),
	prefixer    = require('autoprefixer-stylus'),
	imagemin    = require('gulp-imagemin'),
	cp          = require('child_process');

var messages = {
	jekyllBuild: '<span style="color: grey">Running:</span> $ jekyll build',
	reloading: '<span style="color: grey">Reloading...</span>'
};

var jekyllCommand = (/^win/.test(process.platform)) ? 'jekyll.bat' : 'jekyll';
var jekyllBuildParams = ["build", "--incremental"];

/**
 * Build the Jekyll Site
 */
gulp.task('jekyll-build', function (done) {
	return cp.spawn(jekyllCommand, jekyllBuildParams, {stdio: 'inherit'})
		.on('close', function()
		{
			done();
		});
});
gulp.task('enable-watch', function() {
	jekyllBuildParams.push("--watch");
});


/**
 * Build the Jekyll site (with draft posts).
 */
gulp.task('jekyll-build-drafts', [
	'enable-drafts',
	'jekyll-build'
]);
gulp.task('enable-drafts', function() {
	jekyllBuildParams.push("--drafts");
});

/**
 * Do page reload
 */
gulp.task('jekyll-reload', function (done) {
	browserSync.reload();

	done();
});

/**
 * Rebuild Jekyll & do page reload
 */
gulp.task('jekyll-rebuild', function(done) {
	browserSync.notify(messages.jekyllBuild);
	
	return cp.spawn(jekyllCommand, jekyllBuildParams, {stdio: 'inherit'})
		.on('close', function()
		{
			browserSync.notify(messages.reloading);
			browserSync.reload();
			
			done();
		});
});

/**
 * Wait for jekyll-build, then launch the Server
 */
gulp.task('browser-sync', ['jekyll-build'], function() {
	browserSync({
		server: {
			baseDir: '_site'
		}
	});
});

/**
 * Stylus task
 */
gulp.task('stylus', function(){
		gulp.src('src/styl/main.styl')
		.pipe(plumber())
		.pipe(stylus({
			use:[koutoSwiss(), prefixer(), jeet(),rupture()],
			compress: true
		}))
		.pipe(gulp.dest('_site/assets/css/'))
		.pipe(browserSync.reload({stream:true}))
		.pipe(gulp.dest('assets/css'))
});

/**
 * Javascript Task
 */
gulp.task('js', function(){
	return gulp.src('src/js/**/*.js')
		.pipe(plumber())
		.pipe(concat('main.js'))
		.pipe(uglify())
		.pipe(gulp.dest('assets/js/'))
		.pipe(browserSync.reload({stream:true}))
		.pipe(gulp.dest('_site/assets/js/'))
});

/**
 * Imagemin Task
 */
gulp.task('imagemin', function() {
	return gulp.src('src/img/**/*.{jpg,png,gif}')
		.pipe(plumber())
		.pipe(imagemin({ optimizationLevel: 3, progressive: true, interlaced: true }))
		.pipe(gulp.dest('assets/img/'));
});

/**
 * Watch stylus files for changes & recompile
 * Watch html/md files, run jekyll & reload BrowserSync
 */
gulp.task('watch', function () {
	gulp.watch('src/styl/**/*.styl', ['stylus']);
	gulp.watch('src/js/**/*.js', ['js']);
	gulp.watch('src/img/**/*.{jpg,png,gif}', ['imagemin']);
	gulp.watch(['*.html', '_includes/*.html', '_layouts/*.html', '_posts/*', '_drafts/*'], ['jekyll-rebuild']);
});

/**
 * Watch stylus files for changes & recompile
 * Watch html/md files (including drafts), run jekyll & reload BrowserSync
 */
gulp.task('watch-drafts', ['enable-drafts', 'js', 'stylus', 'browser-sync', 'watch']);

/**
 * Default task, running just `gulp` will compile the sass,
 * compile the jekyll site, launch BrowserSync & watch files.
 */
gulp.task('default', ['js', 'stylus', 'browser-sync', 'watch']);
