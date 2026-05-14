#!/usr/bin/env python3
"""Patch manageInteractionsNew.js to add Winners History setup handlers."""

PATH = '/home/ubuntu/goatsi/src/interactions/manageInteractionsNew.js'

with open(PATH, 'r') as f:
    src = f.read()

# ── 1. Add ChannelType import ─────────────────────────────────────────────────
OLD_IMPORT = """const {
  ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');"""

NEW_IMPORT = """const {
  ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle, ChannelType,
} = require('discord.js');"""

if 'ChannelType' not in src:
    src = src.replace(OLD_IMPORT, NEW_IMPORT, 1)
    print('✓ Added ChannelType import')
else:
    print('! ChannelType already imported')

# ── 2. Add buildWinnersSubPanel import ────────────────────────────────────────
OLD_PANEL_IMPORT = "const { buildManagePanelV2, buildAdminsSubPanel } = require('../panels/managePanel');"
NEW_PANEL_IMPORT = "const { buildManagePanelV2, buildAdminsSubPanel, buildWinnersSubPanel } = require('../panels/managePanel');\nconst { buildWinnersHistoryPayload } = require('../utils/winnersHistory');"

if 'buildWinnersSubPanel' not in src:
    src = src.replace(OLD_PANEL_IMPORT, NEW_PANEL_IMPORT, 1)
    print('✓ Added buildWinnersSubPanel import')
else:
    print('! buildWinnersSubPanel already imported')

# ── 3. Add auto-channel creation after tournament insert in mgr2_tournament_s2 ─
OLD_S2_CLEANUP = """    // Clean up pending
    db.setConfig(`mgr2_pending_${interaction.user.id}`, null);

    await interaction.update(buildManagePanelV2());
    return interaction.followUp({
      content: `✅ **${t.name}** (Season ${t.season}) created!\\nUse \\`/botola\\` to open its panels.`,
      ephemeral: true,
    });
  }"""

NEW_S2_CLEANUP = """    // Clean up pending
    db.setConfig(`mgr2_pending_${interaction.user.id}`, null);

    // Auto-create winners history channel in the configured category
    const catId = db.getConfig('winners_history_category');
    if (catId) {
      try {
        const guild   = interaction.guild;
        const chName  = `${t.template.toLowerCase().replace(/[^a-z0-9]/g, '-')}-winners`;
        const winCh   = await guild.channels.create({
          name: chName,
          type: ChannelType.GuildText,
          parent: catId,
          topic: `Winners History — ${t.name}`,
        });
        const initMsg = await winCh.send(buildWinnersHistoryPayload(t.id)).catch(() => null);
        if (initMsg) {
          db.update('tournaments', t.id, {
            winners_history_ref: { channelId: winCh.id, messageId: initMsg.id },
          });
        }
      } catch (e) {
        console.error('[Winners] Failed to create history channel:', e.message);
      }
    }

    await interaction.update(buildManagePanelV2());
    return interaction.followUp({
      content: `✅ **${t.name}** (Season ${t.season}) created!${catId ? '\\n🏆 Winners History channel auto-created.' : ''}\\nUse \\`/botola\\` to open its panels.`,
      ephemeral: true,
    });
  }"""

if 'Auto-create winners history channel' not in src:
    if OLD_S2_CLEANUP in src:
        src = src.replace(OLD_S2_CLEANUP, NEW_S2_CLEANUP, 1)
        print('✓ Added auto-channel creation in mgr2_tournament_s2')
    else:
        print('ERROR: Could not find mgr2_tournament_s2 cleanup block!')
else:
    print('! Auto-channel creation already present')

# ── 4. Add Winners Setup handlers before module.exports ──────────────────────
WINNERS_HANDLERS = """
  // ── Winners Setup ────────────────────────────────────────────────────────
  if (id === 'mgr2_winners') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    return interaction.update(buildWinnersSubPanel());
  }

  // Set winners history category
  if (id === 'mgr2_winners_setup') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const cur = db.getConfig('winners_history_category') || '';
    return interaction.showModal(
      new ModalBuilder().setCustomId('mgr2_winners_setup_modal').setTitle('Winners History Category')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('category_id').setLabel('Category ID (right-click → Copy ID)')
              .setStyle(TextInputStyle.Short).setValue(cur).setPlaceholder('1234567890123456789').setRequired(true)
          ),
        )
    );
  }

  if (id === 'mgr2_winners_setup_modal') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const catId = interaction.fields.getTextInputValue('category_id').trim().replace(/\\D/g, '');
    if (!catId) return interaction.reply({ content: '❌ Invalid category ID.', ephemeral: true });
    db.setConfig('winners_history_category', catId);
    await interaction.update(buildWinnersSubPanel());
    return interaction.followUp({ content: `✅ Winners History category set to <#${catId}>.`, ephemeral: true });
  }

  // Set winner role for a tournament
  if (id === 'mgr2_winner_role_start') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const tournaments = db.get('tournaments');
    if (!tournaments.length) return interaction.reply({ content: '❌ No tournaments.', ephemeral: true });
    const SEP2 = { type: 14, divider: true, spacing: 1 };
    return interaction.update({
      flags: 32768,
      components: [{ type: 17, accent_color: 0xFFD700, components: [
        { type: 10, content: '**🏆 Set Winner Role — Select a tournament**' },
        SEP2,
        { type: 1, components: [{
          type: 3, custom_id: 'mgr2_winner_role_sel', placeholder: 'Select tournament...',
          options: tournaments.slice(0, 25).map(t => ({
            label: t.name.slice(0, 100), value: String(t.id),
            description: `S${t.season} · ${t.winner_role_id ? 'Role set' : 'No role'}`,
          })),
        }]},
        SEP2,
        { type: 1, components: [{ type: 2, style: 2, label: 'Back', custom_id: 'mgr2_winners' }]},
      ]}],
    });
  }

  if (id === 'mgr2_winner_role_sel') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const tid2 = parseInt(interaction.values[0]);
    const t2   = db.findById('tournaments', tid2);
    if (!t2) return interaction.reply({ content: '❌ Tournament not found.', ephemeral: true });
    return interaction.showModal(
      new ModalBuilder().setCustomId(`mgr2_winner_role_modal_${tid2}`).setTitle(`Winner Role — ${t2.name.slice(0, 30)}`)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('role_id').setLabel('Winner Role ID (right-click role → Copy ID)')
              .setStyle(TextInputStyle.Short).setValue(t2.winner_role_id || '').setPlaceholder('1234567890123456789').setRequired(false)
          ),
        )
    );
  }

  if (id.startsWith('mgr2_winner_role_modal_')) {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const tid3   = parseInt(id.replace('mgr2_winner_role_modal_', ''));
    const roleId = interaction.fields.getTextInputValue('role_id').trim().replace(/\\D/g, '') || null;
    db.update('tournaments', tid3, { winner_role_id: roleId });
    await interaction.update(buildWinnersSubPanel());
    return interaction.followUp({
      content: roleId ? `✅ Winner role set to <@&${roleId}>.` : '✅ Winner role cleared.',
      ephemeral: true,
    });
  }

  // Set winners history message reference for a tournament
  if (id === 'mgr2_winref_start') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const tournaments = db.get('tournaments');
    if (!tournaments.length) return interaction.reply({ content: '❌ No tournaments.', ephemeral: true });
    const SEP3 = { type: 14, divider: true, spacing: 1 };
    return interaction.update({
      flags: 32768,
      components: [{ type: 17, accent_color: 0xFFD700, components: [
        { type: 10, content: '**🏆 Set Winners History Message — Select a tournament**' },
        SEP3,
        { type: 1, components: [{
          type: 3, custom_id: 'mgr2_winref_sel', placeholder: 'Select tournament...',
          options: tournaments.slice(0, 25).map(t => ({
            label: t.name.slice(0, 100), value: String(t.id),
            description: `S${t.season} · ${t.winners_history_ref ? 'Ref set' : 'No ref'}`,
          })),
        }]},
        SEP3,
        { type: 1, components: [{ type: 2, style: 2, label: 'Back', custom_id: 'mgr2_winners' }]},
      ]}],
    });
  }

  if (id === 'mgr2_winref_sel') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const tid4 = parseInt(interaction.values[0]);
    const t4   = db.findById('tournaments', tid4);
    if (!t4) return interaction.reply({ content: '❌ Tournament not found.', ephemeral: true });
    const curRef = t4.winners_history_ref || {};
    return interaction.showModal(
      new ModalBuilder().setCustomId(`mgr2_winref_modal_${tid4}`).setTitle(`History Msg — ${t4.name.slice(0, 28)}`)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('channel_id').setLabel('Channel ID of the winners history channel')
              .setStyle(TextInputStyle.Short).setValue(curRef.channelId || '').setPlaceholder('1234567890123456789').setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('message_id').setLabel('Message ID of the persistent leaderboard')
              .setStyle(TextInputStyle.Short).setValue(curRef.messageId || '').setPlaceholder('1234567890123456789').setRequired(true)
          ),
        )
    );
  }

  if (id.startsWith('mgr2_winref_modal_')) {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const tid5  = parseInt(id.replace('mgr2_winref_modal_', ''));
    const chId  = interaction.fields.getTextInputValue('channel_id').trim().replace(/\\D/g, '');
    const msgId = interaction.fields.getTextInputValue('message_id').trim().replace(/\\D/g, '');
    if (!chId || !msgId) return interaction.reply({ content: '❌ Invalid channel or message ID.', ephemeral: true });
    db.update('tournaments', tid5, { winners_history_ref: { channelId: chId, messageId: msgId } });
    await interaction.update(buildWinnersSubPanel());
    return interaction.followUp({
      content: `✅ Winners History message linked: <#${chId}> / \`${msgId}\`.`,
      ephemeral: true,
    });
  }

"""

MODULE_EXPORTS = "module.exports = { handleMgr2Interaction };"

if 'mgr2_winners' not in src:
    src = src.replace(MODULE_EXPORTS, WINNERS_HANDLERS + MODULE_EXPORTS, 1)
    print('✓ Added Winners Setup handlers')
else:
    print('! Winners handlers already present')

with open(PATH, 'w') as f:
    f.write(src)

print('Done patching manageInteractionsNew.js')
