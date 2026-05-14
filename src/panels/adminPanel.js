'use strict';
const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { db } = require('../utils/database');
const { CHANNEL_MAP } = require('../utils/channelRouter');

const SEP = { type: 14, divider: true, spacing: 1 };
const txt = c => ({ type: 10, content: c });

function chDisplay(template, type) {
  const id = db.get('config')?.channels?.[template]?.[type] || CHANNEL_MAP[template]?.[type];
  return id ? `<#${id}>` : '`not configured`';
}

function buildAdminPanel() {
  const inner = [
    txt('# ⚙️  Admin Setup\nBot configuration — channels and settings.'),
    SEP,
    txt(
      '**⚡ MCL Channels**\n' +
      `Teams List · ${chDisplay('MCL','teamsList')}   Results · ${chDisplay('MCL','results')}\n` +
      `Schedule · ${chDisplay('MCL','matchSchedule')}   Group Draw · ${chDisplay('MCL','groupDraw')}`
    ),
    SEP,
    txt(
      '**🏆 NSEL Channels**\n' +
      `Teams List · ${chDisplay('NSEL','teamsList')}   Results · ${chDisplay('NSEL','results')}\n` +
      `Schedule · ${chDisplay('NSEL','matchSchedule')}   Group Draw · ${chDisplay('NSEL','groupDraw')}`
    ),
    SEP,
    {
      type: 1,
      components: [
        { type: 2, style: 1, label: 'Set MCL Channels',  custom_id: 'adm_set_MCL',  emoji: { name: '⚡' } },
        { type: 2, style: 1, label: 'Set NSEL Channels', custom_id: 'adm_set_NSEL', emoji: { name: '🏆' } },
        { type: 2, style: 2, label: 'Refresh',           custom_id: 'adm_refresh',  emoji: { name: '🔄' } },
      ],
    },
    SEP,
    txt('-# Night Stars • Admin Setup Panel — Admins only'),
    SEP,
  ];

  return { flags: 32768, components: [{ type: 17, accent_color: 0xED4245, components: inner }] };
}

function buildChannelConfigModal(template) {
  const cfg     = db.get('config')?.channels?.[template] || {};
  const fallback = CHANNEL_MAP[template] || {};

  return new ModalBuilder()
    .setCustomId(`adm_channels_modal_${template}`)
    .setTitle(`Set ${template} Channels`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('teamsList').setLabel('Teams List Channel ID')
          .setStyle(TextInputStyle.Short).setValue(cfg.teamsList || fallback.teamsList || '').setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('results').setLabel('Results Channel ID')
          .setStyle(TextInputStyle.Short).setValue(cfg.results || fallback.results || '').setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('matchSchedule').setLabel('Match Schedule Channel ID')
          .setStyle(TextInputStyle.Short).setValue(cfg.matchSchedule || fallback.matchSchedule || '').setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('groupDraw').setLabel('Group Draw Channel ID')
          .setStyle(TextInputStyle.Short).setValue(cfg.groupDraw || fallback.groupDraw || '').setRequired(true)
      ),
    );
}

module.exports = { buildAdminPanel, buildChannelConfigModal };
