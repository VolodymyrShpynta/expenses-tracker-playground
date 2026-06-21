# Play Store listing metadata

Localized **Google Play store-listing** copy for Spendium, one folder per
language. These are the texts shown on the app's Play Store page in each
locale — they are independent of the **in-app** translations in
[`../../../src/i18n/locales/`](../../../src/i18n/locales).

## Why this layout

This follows the **fastlane `supply` metadata convention**
(`fastlane/metadata/android/<locale>/`). It is the de-facto standard for
storing Play listing text in a repo, so the files are tool-readable if you
ever wire up `fastlane supply` or an equivalent uploader.

**We do not run fastlane today** (there is no `Fastfile` / `Gemfile`). The
layout is used purely as an organized, diff-friendly source of truth. For
now, copy each file into **Play Console → Main store listing →
Manage translations** for the matching language.

## Locale codes

Folder names are Play Console BCP-47 codes, chosen to match the flavor of
the app's own translations:

| App locale | Play locale | Notes                                  |
|------------|-------------|----------------------------------------|
| en         | en-US       | source of truth (mirrors Appendix A)   |
| cs         | cs-CZ       |                                        |
| de         | de-DE       |                                        |
| es         | es-ES       | Castilian; es-419 / es-US also offered |
| fr         | fr-FR       |                                        |
| hi         | hi-IN       |                                        |
| id         | id-ID       |                                        |
| it         | it-IT       |                                        |
| ja         | ja-JP       |                                        |
| ko         | ko-KR       |                                        |
| pl         | pl-PL       |                                        |
| pt         | pt-BR       | app strings are Brazilian Portuguese   |
| tr         | tr-TR       |                                        |
| uk         | uk-UA       |                                        |
| zh         | zh-CN       | Simplified; zh-TW / zh-HK also offered |

## Files per locale

| File                    | Play field        | Limit       |
|-------------------------|-------------------|-------------|
| `short_description.txt` | Short description | 80 chars    |
| `full_description.txt`  | Full description  | 4 000 chars |

`title.txt` is intentionally omitted — the app title **Spendium** is a brand
name, identical in every locale, so Play keeps the default title.

## Source of truth

The English copy mirrors **Appendix A** of
[`../../../GOOGLE-PLAY-DEPLOYMENT.md`](../../../GOOGLE-PLAY-DEPLOYMENT.md).
When you change the English listing, update that appendix and re-translate
the other locales here.

The native-script language list inside each `full_description.txt`
("English, Čeština, Українська, …") is intentionally identical across all
locales — it advertises the languages the app ships in.
