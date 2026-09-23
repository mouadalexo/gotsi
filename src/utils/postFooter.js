'use strict';
const { db } = require('./database');

const DEFAULT_POST_FOOTER = '© 24 2026  |  Goatsi Bot';

function getPostFooterText() {
  const saved = db.getConfig('post_footer_text');
  return typeof saved === 'string' && saved.trim()
    ? saved.trim()
    : DEFAULT_POST_FOOTER;
}

function postFooterComponent() {
  return { type: 10, content: `-# ${getPostFooterText()}` };
}

module.exports = { DEFAULT_POST_FOOTER, getPostFooterText, postFooterComponent };
