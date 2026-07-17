'use strict';
const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { db } = require('../utils/database');
const { isBotolaManager } = require('../utils/permissions');
const { buildInfoPickerPanel, buildInfoPanel, getInfoCfg } = require('../panels/infoPanel');

function noPermission(i) {
  return i.reply({ content: '❌ Managers only.', ephemeral: true });
}

async function handleInfoInteraction(interaction) {
  const id = interaction.customId || '';
  if (!isBotolaManager(interaction.member)) return noPermission(interaction);

  if (id === 'inf_pick') {
    const tid = parseInt(interaction.values[0]);
    return interaction.update(buildInfoPanel(tid));
  }

  if (id === 'inf_back') {
    return interaction.update(buildInfoPickerPanel());
  }

  if (id.startsWith('inf_edit_')) {
    const tid = parseInt(id.split('_')[2]);
    const cfg = getInfoCfg(tid);
    return interaction.showModal(
      new ModalBuilder()
        .setCustomId('inf_modal_' + tid)
        .setTitle('Setup Announcement Message')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('inf_text')
              .setLabel('Write freely — # bold emojis all work')
              .setStyle(TextInputStyle.Paragraph)
              .setValue(cfg.text || '')
              .setMaxLength(2000)
              .setRequired(false)
              .setPlaceholder('# 🏆 Tournament starts now!\n**Good luck** to all teams...')
          )
        )
    );
  }

  if (id.startsWith('inf_modal_')) {
    const tid = parseInt(id.split('_')[2]);
    const cfg = getInfoCfg(tid);
    cfg.text  = interaction.fields.getTextInputValue('inf_text').trim();
    db.setConfig('info_cfg_' + tid, cfg);
    return interaction.update(buildInfoPanel(tid));
  }

  if (id.startsWith('inf_tag_')) {
    const tid = parseInt(id.split('_')[2]);
    const cfg = getInfoCfg(tid);
    cfg.tag   = !cfg.tag;
    db.setConfig('info_cfg_' + tid, cfg);
    return interaction.update(buildInfoPanel(tid));
  }

  if (id.startsWith('inf_send_')) {
    const tid = parseInt(id.split('_')[2]);
    const t   = db.findById('tournaments', tid);
    const cfg = getInfoCfg(tid);

    if (!cfg.text)        return interaction.reply({ content: '❌ No message — click Setup first.', ephemeral: true });
    if (!t?.info_channel) return interaction.reply({ content: '❌ No info channel set.', ephemeral: true });

    await interaction.deferUpdate();

    const ch = await interaction.client.channels.fetch(t.info_channel).catch(() => null);
    if (!ch) return interaction.followUp({ content: '❌ Cannot access info channel.', ephemeral: true });

    if (cfg.tag && t.registration_role_id) {
      await ch.send({ content: '<@&' + t.registration_role_id + '>' }).catch(() => {});
    }
    await ch.send({ content: cfg.text }).catch(() => {});

    await interaction.editReply(buildInfoPanel(tid));
    return interaction.followUp({ content: '✅ Sent to <#' + t.info_channel + '>!', ephemeral: true });
  }
}

module.exports = { handleInfoInteraction };
