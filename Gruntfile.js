module.exports = function(grunt) {
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    ts: {
      tsconfig: './tsconfig.json',
      buildWatch: {
        watch: './src',
      },
      build: {}
    },
    mkdir: {
      assets: {
        options: {
          create: ['dist/assets'],
        }
      }
    },
    copy: {
      assets: {
        files: [{
          expand: true,
          cwd: 'src/assets',
          src: '**',
          dest: 'dist/assets',
        }]
      },
    },
    clean: {
      build: ['dist'],
    }
  });
  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-mkdir');
  grunt.loadNpmTasks('grunt-contrib-copy');
  grunt.loadNpmTasks('grunt-ts');
  grunt.registerTask('default', ['clean:build', 'ts:build', 'mkdir:assets', 'copy:assets']);
};
