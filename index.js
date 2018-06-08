/* eslint-env node */
'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');
const critical = require('critical');
const puppeteer = require('puppeteer');

const DEFAULT_OPTIONS = {
  visitPath: '/app-shell',
  outputFile: 'index.html',
  chromeFlags: []
};

const DEFAULT_CRITICAL_OPTIONS = {
  minify: true,
};

const PLACEHOLDER = '<!-- EMBER_APP_SHELL_PLACEHOLDER -->';

const SERVER_PORT = process.env.APP_SHELL_EXPRESS_PORT || '4321';

module.exports = {
  name: 'ember-app-shell',

  included(app) {
    this._super.included && this._super.included.apply(this, arguments);
    this.app = app;
    this.app.options = this.app.options || {};
    this.app.options['ember-app-shell'] = Object.assign({}, DEFAULT_OPTIONS, this.app.options['ember-app-shell']);
  },

  postBuild({ directory }) {
   if (this.app.env === 'test') {
      return;
    }
    let { chromeFlags, outputFile, visitPath, skipCritical, root } = this.app.options['ember-app-shell'];
    let url = path.join(`http://localhost:${SERVER_PORT}`, visitPath);

    let launchPuppeteer = async function() {
      let browser = await puppeteer.launch(chromeFlags);
      let page = await browser.newPage();
      await page.goto(url);
      let appSelector = '.ember-view';
      await page.waitForSelector(appSelector);
      let content = await page.evaluate(appSelector => document.querySelector(appSelector).outerHTML, appSelector);

      let indexHTML = fs.readFileSync(path.join(directory, outputFile)).toString();
      let appShellHTML = indexHTML.replace(PLACEHOLDER, content);

      if (skipCritical) {
        fs.writeFileSync(path.join(directory, outputFile), appShellHTML, 'utf8');
      } else {
        let criticalOptions = Object.assign(DEFAULT_CRITICAL_OPTIONS, {
          inline: true,
          base: directory,
          folder: directory,
          html: appShellHTML,
          dest: outputFile
        }, this.app.options['ember-app-shell'].criticalCSSOptions);
        await critical.generate(criticalOptions);
      }
      await browser.close();
    }

    return this._launchAppServer(directory, root).then(server => {
      return launchPuppeteer()
        .then(() => server.close())
        .catch(() => server.close());
    });
  },

  contentFor(type) {
    if (type === 'body-footer' && this.app.env !== 'test') {
      return PLACEHOLDER;
    }
  },

  _launchAppServer(directory, root) {
    return new Promise((resolve, reject) => {
      let app = express();
      let server = http.createServer(app);
      if (root) {
        app.use(root, express.static(directory));
      } else {
        app.use(express.static(directory));
      }
      app.get('*', function (req, res) {
        res.sendFile('/index.html', { root: directory });
      });

      server.listen(SERVER_PORT, () => {
        resolve(server);
      });
    });
  },

};
