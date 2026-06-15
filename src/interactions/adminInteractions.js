'use strict';
const { buildAdminPanel, buildChannelPickerPanel, buildTestChannelPickerPanel } = require('../panels/adminPanel');
const { db } = require('../utils/database');

// Auto-delete a short text feedback reply after 5 s
async function admTextReply(interaction, content) {
  const msg = await interaction.reply({ content, ephemeral: true });
  setTimeout(() => interaction.deleteReply().catch(() => {}), 5_000);
  return msg;
}

async function handleAdminInteraction(interaction) {
  const id = interaction.customId;

  if (id === 'adm_refresh' || id === 'adm_done') {
    return interaction.update(buildAdminPanel());
  }

  if (id === 'adm_tch_EL' || id === 'adm_tch_MCL') {
    const template = id.replace('adm_tch_', '');
    return interaction.reply({ ...buildChannelPickerPanel(template), ephemeral: true });
  }

  if (id === 'adm_tch_TEST') {
    return interaction.reply({ ...buildTestChannelPickerPanel(), ephemeral: true });
  }

  if (id === 'adm_ch_TEST_testpanel') {
    const channelId = interaction.values[0] || null;
    db.setConfig('test_channel_id', channelId);
    return interaction.update(buildTestChannelPickerPanel());
  }

  if (id.startsWith('adm_ch_')) {
    const parts     = id.split('_');
    const template  = parts[2];
    const key       = parts[3];
    const channelId = interaction.values[0] || null;

    const t = db.get('tournaments')
      .filter(t2 => t2.template === template)
      .sort((a, b) => b.season - a.season)[0];
    if (!t) return admTextReply(interaction, `❌ No ${template} tournament found.`);

    db.update('tournaments', t.id, {
      channels: { ...(t.channels || {}), [key]: channelId },
    });

    return interaction.update(buildChannelPickerPanel(template));
  }

  if (id.startsWith('adm_setregrole_') && !id.includes('_modal_')) {
    const template = id.replace('adm_setregrole_', '');
    const t = db.get('tournaments')
      .filter(t2 => t2.template === template)
      .sort((a, b) => b.season - a.season)[0];
    if (!t) return admTextReply(interaction, `❌ No ${template} tournament found.`);

    const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
    return interaction.showModal(
      new ModalBuilder()
        .setCustomId(`adm_setregrole_modal_${template}`)
        .setTitle(`Set ${template} Registration Role`)
        .addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('role_id')
            .setLabel('Role ID — right-click role → Copy ID. Blank = remove.')
            .setStyle(TextInputStyle.Short)
            .setValue(t.registration_role_id || '')
            .setPlaceholder('1234567890123456789')
            .setRequired(false)
        ))
    );
  }

  if (id.startsWith('adm_setregrole_modal_')) {
    const template = id.replace('adm_setregrole_modal_', '');
    const t = db.get('tournaments')
      .filter(t2 => t2.template === template)
      .sort((a, b) => b.season - a.season)[0];
    if (!t) return admTextReply(interaction, `❌ No ${template} tournament found.`);

    const raw    = interaction.fields.getTextInputValue('role_id').trim();
    const roleId = raw.replace(/\D/g, '') || null;
    db.update('tournaments', t.id, { registration_role_id: roleId });

    await admTextReply(interaction, roleId
        ? `✅ **${template}** registration role set to <@&${roleId}>. Players will receive it on enrollment.`
        : `✅ **${template}** registration role cleared.`);
    return interaction.update(buildAdminPanel());
  }

  // ── Rename Tournament ────────────────────────────────────────────────────
  if (id.startsWith('adm_rename_') && !id.includes('_modal_')) {
    const template = id.replace('adm_rename_', '');
    const t = db.get('tournaments')
      .filter(t2 => t2.template === template)
      .sort((a, b) => b.season - a.season)[0];
    if (!t) return admTextReply(interaction, `❌ No ${template} tournament found.`);

    const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
    return interaction.showModal(
      new ModalBuilder()
        .setCustomId(`adm_rename_modal_${template}`)
        .setTitle(`Rename ${template} Tournament`)
        .addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('new_name')
            .setLabel('New tournament name')
            .setStyle(TextInputStyle.Short)
            .setValue(t.name)
            .setPlaceholder('e.g. EL')
            .setMaxLength(50)
            .setRequired(true)
        ))
    );
  }

  if (id.startsWith('adm_rename_modal_')) {
    const template = id.replace('adm_rename_modal_', '');
    const t = db.get('tournaments')
      .filter(t2 => t2.template === template)
      .sort((a, b) => b.season - a.season)[0];
    if (!t) return admTextReply(interaction, `❌ No ${template} tournament found.`);

    const newName = interaction.fields.getTextInputValue('new_name').trim();
    if (!newName) return admTextReply(interaction, '❌ Name cannot be empty.');

    const oldName = t.name;
    db.update('tournaments', t.id, { name: newName });

    await interaction.deferUpdate();
    await interaction.editReply(buildAdminPanel());
    return interaction.followUp({
      content: `✅ Renamed **${oldName}** → **${newName}**. All panels and posts will now use the new name.`,
      ephemeral: true,
    });
  }
}

module.exports = { handleAdminInteraction };
