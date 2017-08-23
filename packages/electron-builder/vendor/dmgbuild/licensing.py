# -*- coding: utf-8 -*-
from __future__ import unicode_literals

import os
import struct

from .resources import *

# ISO language and country codes to Macintosh Region codes (from Script.h)
# <key> == CFLocaleCreateCanonicalLocaleIdentifierFromScriptManagerCodes(NULL,
#                                                                        kTextLanguageDontCare,
#                                                                        <value>)
region_codes = {
    "en_US":             0,
    "fr_FR":             1,
    "en_GB":             2,
    "de_DE":             3,
    "it_IT":             4,
    "nl_NL":             5,
    "nl_BE":             6,
    "sv_SE":             7,
    "es_ES":             8,
    "da_DK":             9,
    "pt_PT":             10,
    "fr_CA":             11,
    "nb_NO":             12,
    "he_IL":             13,
    "ja_JP":             14,
    "en_AU":             15,
    "ar":                16,
    "fi_FI":             17,
    "fr_CH":             18,
    "de_CH":             19,
    "el_GR":             20,
    "is_IS":             21,
    "mt_MT":             22,
    "el_CY":             23,
    "tr_TR":             24,
    "hi_IN":             33,
    "ur_PK":             34,
    "it_CH":             36,
    "ro_RO":             39,
    "grc":               40,
    "lt_LT":             41,
    "pl_PL":             42,
    "hu_HU":             43,
    "et_EE":             44,
    "lv_LV":             45,
    "se":                46,
    "fo_FO":             47,
    "fa_IR":             48,
    "ru_RU":             49,
    "ga_IE":             50,
    "ko_KR":             51,
    "zh_CN":             52,
    "zh_TW":             53,
    "th_TH":             54,
    "cs_CZ":             56,
    "sk_SK":             57,
    "bn":                60,
    "be_BY":             61,
    "uk_UA":             62,
    "sr_RS":             65,
    "sl_SI":             66,
    "mk_MK":             67,
    "hr_HR":             68,
    "pt_BR":             71,
    "bg_BG":             72,
    "ca_ES":             73,
    "gd":                75,
    "gv":                76,
    "br":                77,
    "iu_CA":             78,
    "cy":                79,
    "ga-Latg_IE":        81,
    "en_CA":             82,
    "dz_BT":             83,
    "hy_AM":             84,
    "ka_GE":             85,
    "es_419":            86,
    "to_TO":             88,
    "fr_001":            91,
    "de_AT":             92,
    "gu_IN":             94,
    "pa":                95,
    "ur_IN":             96,
    "vi_VN":             97,
    "fr_BE":             98,
    "uz_UZ":             99,
    "en_SG":             100,
    "nn_NO":             101,
    "af_ZA":             102,
    "eo":                103,
    "mr_IN":             104,
    "bo":                105,
    "ne_NP":             106,
    "kl":                107,
    "en_IE":             108
}

# Map of region constants to script constants (from Script.h)
# TextEncoding textEncoding;
# GetTextEncodingFromScriptInfo(kTextScriptDontCare, kTextLanguageDontCare, <key>, &textEncoding);
# <value> == GetTextEncodingBase(textEncoding);
script_codes = {
    0:   0,
    1:   0,
    2:   0,
    3:   0,
    4:   0,
    5:   0,
    6:   0,
    7:   0,
    8:   0,
    9:   0,
    10:  0,
    11:  0,
    12:  0,
    13:  5,
    14:  1,
    15:  0,
    16:  4,
    17:  0,
    18:  0,
    19:  0,
    20:  6,
    21:  37,
    22:  0,
    23:  6,
    24:  35,
    25:  36,
    26:  0,
    27:  0,
    30:  0,
    31:  0,
    32:  0,
    33:  9,
    34:  4,
    35:  35,
    36:  0,
    37:  0,
    39:  38,
    40:  6,
    41:  29,
    42:  29,
    43:  29,
    44:  29,
    45:  29,
    46:  0,
    47:  37,
    48:  140,
    49:  7,
    50:  39,
    51:  3,
    52:  25,
    53:  2,
    54:  21,
    56:  29,
    57:  29,
    59:  29,
    60:  13,
    61:  7,
    62:  7,
    64:  6,
    65:  7,
    66:  36,
    67:  7,
    68:  36,
    70:  0,
    71:  0,
    72:  7,
    73:  0,
    75:  39,
    76:  39,
    77:  39,
    78:  236,
    79:  39,
    81:  40,
    82:  0,
    83:  26,
    84:  24,
    85:  23,
    86:  0,
    88:  0,
    91:  0,
    92:  0,
    94:  11,
    95:  10,
    96:  4,
    97:  30,
    98:  0,
    99:  7,
    100: 0,
    101: 0,
    102: 0,
    103: 0,
    104: 9,
    105: 26,
    106: 9,
    107: 0,
    108: 0
}

# Map of TextEncodingBase constants to Python encoder names (from TextCommon.h)
encodings_map = {
    0:   'mac_roman',       # kTextEncodingMacRoman
    1:   'shift_jis',       # kTextEncodingMacJapanese
    2:   'big5',            # kTextEncodingMacChineseTrad
    3:   'euc_kr',          # kTextEncodingMacKorean
    4:   'mac_arabic',      # kTextEncodingMacArabic
    6:   'mac_greek',       # kTextEncodingMacGreek
    7:   'mac_cyrillic',    # kTextEncodingMacCyrillic
    21:  'iso8859_11',      # kTextEncodingMacThai
    25:  'euc-cn',          # kTextEncodingMacChineseSimp
    29:  'mac_centeuro',    # kTextEncodingMacCentralEurRoman
    35:  'mac_turkish',     # kTextEncodingMacTurkish
    36:  'mac_croatian',    # kTextEncodingMacCroatian
    37:  'mac_iceland',     # kTextEncodingMacIcelandic
    38:  'mac_romanian',    # kTextEncodingMacRomanian
    140: 'mac_farsi'        # kTextEncodingMacFarsi
}

# Standard fonts
fonts = {
    'New York':      2,
    'Geneva':        3,
    'Monaco':        4,
    'Venice':        5,
    'London':        6,
    'Athens':        7,
    'San Francisco': 8,
    'Toronto':       9,
    'Cairo':         11,
    'Los Angeles':   12,
    'Times':         20,
    'Helvetica':     21,
    'Courier':       22,
    'Symbol':        23,
    'Mobile':        24
}

# Buttons (these come from the SLAResources file which you can find in the SLA
#          SDK on developer.apple.com)
default_buttons = {
    0: (
        b'English',
        b'Agree',
        b'Disagree',
        b'Print',
        b'Save',
        b'If you agree with the terms of this license, press "Agree" to '
        b'install the software.  If you do not agree, press "Disagree".'
    ),

    3: (
        b'Deutsch',
        b'Akzeptieren',
        b'Ablehnen',
        b'Drucken',
        b'Sichern...',
        b'Klicken Sie in \xd2Akzeptieren\xd3, wenn Sie mit den Bestimmungen des Software-Lizenzvertrags einverstanden sind. Falls nicht, bitte \xd2Ablehnen\xd3 anklicken. Sie k\x9annen die Software nur installieren, wenn Sie \xd2Akzeptieren\xd3 angeklickt haben.'
    ),

    8: (
        b'Espa\x96ol',
        b'Aceptar',
        b'No aceptar',
        b'Imprimir',
        b'Guardar...',
        b'Si est\x87 de acuerdo con los t\x8erminos de esta licencia, pulse "Aceptar" para instalar el software. En el supuesto de que no est\x8e de acuerdo con los t\x8erminos de esta licencia, pulse "No aceptar."'
    ),

    1: (
        b'Fran\x8dais',
        b'Accepter',
        b'Refuser',
        b'Imprimer',
        b'Enregistrer...',
        b'Si vous acceptez les termes de la pr\x8esente licence, cliquez sur "Accepter" afin d\'installer le logiciel. Si vous n\'\x90tes pas d\'accord avec les termes de la licence, cliquez sur "Refuser".'
    ),

    4: (
        b'Italiano',
        b'Accetto',
        b'Rifiuto',
        b'Stampa',
        b'Registra...',
        b'Se accetti le condizioni di questa licenza, fai clic su "Accetto" per installare il software. Altrimenti fai clic su "Rifiuto".'
    ),

    14: (
        b'Japanese',
        b'\x93\xaf\x88\xd3\x82\xb5\x82\xdc\x82\xb7',
        b'\x93\xaf\x88\xd3\x82\xb5\x82\xdc\x82\xb9\x82\xf1',
        b'\x88\xf3\x8d\xfc\x82\xb7\x82\xe9',
        b'\x95\xdb\x91\xb6...',
        b'\x96{\x83\\\x83t\x83g\x83E\x83G\x83A\x8eg\x97p\x8b\x96\x91\xf8\x8c_\x96\xf1\x82\xcc\x8f\xf0\x8c\x8f\x82\xc9\x93\xaf\x88\xd3\x82\xb3\x82\xea\x82\xe9\x8f\xea\x8d\x87\x82\xc9\x82\xcd\x81A\x83\\\x83t\x83g\x83E\x83G\x83A\x82\xf0\x83C\x83\x93\x83X\x83g\x81[\x83\x8b\x82\xb7\x82\xe9\x82\xbd\x82\xdf\x82\xc9\x81u\x93\xaf\x88\xd3\x82\xb5\x82\xdc\x82\xb7\x81v\x82\xf0\x89\x9f\x82\xb5\x82\xc4\x82\xad\x82\xbe\x82\xb3\x82\xa2\x81B\x81@\x93\xaf\x88\xd3\x82\xb3\x82\xea\x82\xc8\x82\xa2\x8f\xea\x8d\x87\x82\xc9\x82\xcd\x81A\x81u\x93\xaf\x88\xd3\x82\xb5\x82\xdc\x82\xb9\x82\xf1\x81v\x82\xf0\x89\x9f\x82\xb5\x82\xc4\x82\xad\x82\xbe\x82\xb3\x82\xa2\x81B'
    ),

    5: (
        b'Nederlands',
        b'Ja',
        b'Nee',
        b'Print',
        b'Bewaar...',
        b'Indien u akkoord gaat met de voorwaarden van deze licentie, kunt u op \'Ja\' klikken om de programmatuur te installeren. Indien u niet akkoord gaat, klikt u op \'Nee\'.'
    ),

    7: (
        b'Svensk',
        b'Godk\x8anns',
        b'Avb\x9ajs',
        b'Skriv ut',
        b'Spara...',
        b'Om Du godk\x8anner licensvillkoren klicka p\x8c "Godk\x8anns" f\x9ar att installera programprodukten. Om Du inte godk\x8anner licensvillkoren, klicka p\x8c "Avb\x9ajs".'
    ),

    71: (
        b'Portugu\x90s',
        b'Concordar',
        b'Discordar',
        b'Imprimir',
        b'Salvar...',
        b'Se est\x87 de acordo com os termos desta licen\x8da, pressione "Concordar" para instalar o software. Se n\x8bo est\x87 de acordo, pressione "Discordar".'
    ),

    52: (
        b'Simplified Chinese',
        b'\xcd\xac\xd2\xe2',
        b'\xb2\xbb\xcd\xac\xd2\xe2',
        b'\xb4\xf2\xd3\xa1',
        b'\xb4\xe6\xb4\xa2\xa1\xad',
        b'\xc8\xe7\xb9\xfb\xc4\xfa\xcd\xac\xd2\xe2\xb1\xbe\xd0\xed\xbf\xc9\xd0\xad\xd2\xe9\xb5\xc4\xcc\xf5\xbf\xee\xa3\xac\xc7\xeb\xb0\xb4\xa1\xb0\xcd\xac\xd2\xe2\xa1\xb1\xc0\xb4\xb0\xb2\xd7\xb0\xb4\xcb\xc8\xed\xbc\xfe\xa1\xa3\xc8\xe7\xb9\xfb\xc4\xfa\xb2\xbb\xcd\xac\xd2\xe2\xa3\xac\xc7\xeb\xb0\xb4\xa1\xb0\xb2\xbb\xcd\xac\xd2\xe2\xa1\xb1\xa1\xa3'
    ),

    53: (
        b'Traditional Chinese',
        b'\xa6P\xb7N',
        b'\xa4\xa3\xa6P\xb7N',
        b'\xa6C\xa6L',
        b'\xc0x\xa6s\xa1K',
        b'\xa6p\xaaG\xb1z\xa6P\xb7N\xa5\xbb\xb3\\\xa5i\xc3\xd2\xb8\xcc\xaa\xba\xb1\xf8\xb4\xda\xa1A\xbd\xd0\xab\xf6\xa1\xa7\xa6P\xb7N\xa1\xa8\xa5H\xa6w\xb8\xcb\xb3n\xc5\xe9\xa1C\xa6p\xaaG\xa4\xa3\xa6P\xb7N\xa1A\xbd\xd0\xab\xf6\xa1\xa7\xa4\xa3\xa6P\xb7N\xa1\xa8\xa1C'
    ),

    9: (
        b'Dansk',
        b'Enig',
        b'Uenig',
        b'Udskriv',
        b'Arkiver...',
        b'Hvis du accepterer betingelserne i licensaftalen, skal du klikke p\x8c \xd2Enig\xd3 for at installere softwaren. Klik p\x8c \xd2Uenig\xd3 for at annullere installeringen.'
    ),

    17: (
        b'Suomi',
        b'Hyv\x8aksyn',
        b'En hyv\x8aksy',
        b'Tulosta',
        b'Tallenna\xc9',
        b'Hyv\x8aksy lisenssisopimuksen ehdot osoittamalla \xd5Hyv\x8aksy\xd5. Jos et hyv\x8aksy sopimuksen ehtoja, osoita \xd5En hyv\x8aksy\xd5.'
    ),

    51: (
        b'Korean',
        b'\xb5\xbf\xc0\xc7',
        b'\xb5\xbf\xc0\xc7 \xbe\xc8\xc7\xd4',
        b'\xc7\xc1\xb8\xb0\xc6\xae',
        b'\xc0\xfa\xc0\xe5...',
        b'\xbb\xe7\xbf\xeb \xb0\xe8\xbe\xe0\xbc\xad\xc0\xc7 \xb3\xbb\xbf\xeb\xbf\xa1 \xb5\xbf\xc0\xc7\xc7\xcf\xb8\xe9, "\xb5\xbf\xc0\xc7" \xb4\xdc\xc3\xdf\xb8\xa6 \xb4\xad\xb7\xaf \xbc\xd2\xc7\xc1\xc6\xae\xbf\xfe\xbe\xee\xb8\xa6 \xbc\xb3\xc4\xa1\xc7\xcf\xbd\xca\xbd\xc3\xbf\xc0. \xb5\xbf\xc0\xc7\xc7\xcf\xc1\xf6 \xbe\xca\xb4\xc2\xb4\xd9\xb8\xe9, "\xb5\xbf\xc0\xc7 \xbe\xc8\xc7\xd4" \xb4\xdc\xc3\xdf\xb8\xa6 \xb4\xa9\xb8\xa3\xbd\xca\xbd\xc3\xbf\xc0.'
    ),

    12: (
        b'Norsk',
        b'Enig',
        b'Ikke enig',
        b'Skriv ut',
        b'Arkiver...',
        b'Hvis De er enig i bestemmelsene i denne lisensavtalen, klikker De p\x8c "Enig"-knappen for \x8c installere programvaren. Hvis De ikke er enig, klikker De p\x8c "Ikke enig".'
    ),
}

class LPicResource (Resource):
    def __init__(self, res_id, res_name, default_lang, lpic, res_attrs=0):
        data = []
        data.append(struct.pack(b'>HH', default_lang, len(lpic)))
        for lang,rid,two_byte in lpic:
            data.append(struct.pack(b'>HHH', lang, rid, int(two_byte)))
        super(LPicResource, self).__init__(b'LPic', res_id, res_name,
                                           b''.join(data), res_attrs)

def get_encoder_name(locale):
    if locale not in region_codes:
        raise Exception("Cannot determine region code for locale '%s'" % locale)
    region_code = region_codes[locale]

    if region_code not in script_codes:
        raise Exception("Cannot determine script code for locale '%s'" % locale)
    script_code = script_codes[region_code]

    if script_code not in encodings_map:
        raise Exception("Cannot determine Python encoder name for locale '%s' - "
                        "encode the string data manually as a byte array instead" % locale)
    return encodings_map[script_code]

def maybe_encode(s, encoding):
    if isinstance(s, bytes):
        return s
    return s.encode(encoding)

def add_license(filename, license_info):
    """Add a license agreement to the specified disk image file, which should
    have been unflattened first."""

    fork = ResourceFork.from_file(filename)

    default_lang = license_info.get('default-language', 'en_US')
    default_lang_id = region_codes.get(default_lang, 0)

    lpic = []
    ndx = 1
    for language,license_info in license_info['licenses'].items():
        if language not in region_codes:
            raise Exception("Unknown language '" + language + "'. Valid languages are: " +
                            ", ".join(sorted(region_codes.keys())))
        encoding_name = get_encoder_name(language)
        lang_id = region_codes[language]

        is_two_byte = lang_id in (14, 51, 52, 53) # Japanese, Korean, SimpChinese, TradChinese

        license_data = license_info.get('data')

        if license_info.get('isRtf'):
            fork.add(Resource(b'RTF ', 5000 + ndx, language + ' SLA',
                              str(license_data)))
        else:
            fork.add(TextResource(5000 + ndx, language + ' SLA', license_data))
            fork.add(StyleResource(5000 + ndx, language + ' SLA',
                                   [Style(0, 12, 9, Style.Helvetica,
                                          0, 0, (0, 0, 0))]))

        buttons = license_info.get('buttons', {}).get(language, None)
        if buttons is None:
            buttons = default_buttons.get(lang_id, None)
            if buttons is None:
                buttons = default_buttons[0]

        buttons = [maybe_encode(b, encoding_name) for b in buttons]

        fork.add(StringListResource(5000 + ndx, language + ' Buttons',
                                    buttons))

        lpic.append((lang_id, ndx, is_two_byte))

        ndx += 1

    fork.add(LPicResource(5000, None, default_lang_id, lpic))

    fork.write_to_file(filename)
