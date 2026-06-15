const { EmbedBuilder } = require('discord.js');

const COLORS = {
  primary: 0x2B2D31,
  success: 0x57F287,
  error:   0xED4245,
  warning: 0xFEE75C,
  info:    0x5865F2,
  gold:    0xF1C40F,
  purple:  0x9B59B6,
};

const E = {
  cup:        '<a:cup:1501741159557500971>',
  arrow:      '<a:arrow:1501741110798585927>',
  smallarrow: '<a:smallarrow:1472222559645863936>',
  fire:       '<a:fire:1472250580583059611>',
  crown:      '<a:crown:1501741170668077127>',
  hashtag:    '<a:hashtag:1501741088736678069>',
  channel:    '<a:channelutility:1501741046734786600>',
  yeaaaah:    '<a:yeaaaah:1472250648966987858>',
  party:      '<a:party:1501741131841536101>',
};

function successEmbed(title, description) {
  return new EmbedBuilder().setColor(COLORS.success).setTitle(`✅  ${title}`).setDescription(description).setTimestamp();
}
function errorEmbed(title, description) {
  return new EmbedBuilder().setColor(COLORS.error).setTitle(`❌  ${title}`).setDescription(description).setTimestamp();
}
function infoEmbed(title, description) {
  return new EmbedBuilder().setColor(COLORS.info).setTitle(title).setDescription(description).setTimestamp();
}
function primaryEmbed(title, description) {
  return new EmbedBuilder().setColor(COLORS.primary).setTitle(title).setDescription(description || '').setTimestamp();
}
function warningEmbed(title, description) {
  return new EmbedBuilder().setColor(COLORS.warning).setTitle(`⚠️  ${title}`).setDescription(description).setTimestamp();
}

module.exports = { successEmbed, errorEmbed, infoEmbed, primaryEmbed, warningEmbed, COLORS, E };
