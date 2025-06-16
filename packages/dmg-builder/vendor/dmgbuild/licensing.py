import os

# based on https://github.com/argv-minus-one/dmg-license/blob/master/language-info-generator/Languages.tsv
# note that this table specifies STR# Resource ID but it seems to have no effect
language_info_map = {
    "da_DK": {"buttons": "Danish", "name": "Danish", "language_id": 9},
    "de_AT": {"buttons": "German", "name": "German (Austrian)", "language_id": 92},
    "de_CH": {"buttons": "German", "name": "German (Swiss)", "language_id": 19},
    "de_DE": {"buttons": "German", "name": "German", "language_id": 3},
    "en_AU": {"buttons": "English", "name": "English (Australian)", "language_id": 15},
    "en_GB": {"buttons": "English", "name": "English (UK)", "language_id": 2},
    "en_IE": {"buttons": "English", "name": "English (Ireland)", "language_id": 108},
    "en_SG": {
        "buttons": "English",
        "name": "English (Singaporean)",
        "language_id": 100,
    },
    "en_US": {"buttons": "English", "name": "English", "language_id": 0},
    "es_ES": {"buttons": "Spanish", "name": "Spanish", "language_id": 8},
    "fi_FI": {"buttons": "Finnish", "name": "Finnish", "language_id": 17},
    "fr_BE": {"buttons": "French", "name": "French (Belgian)", "language_id": 98},
    "fr_CA": {"buttons": "French", "name": "French (Canadian)", "language_id": 11},
    "fr_CH": {"buttons": "French", "name": "French (Swiss)", "language_id": 18},
    "fr_FR": {"buttons": "French", "name": "French", "language_id": 1},
    "it_IT": {"buttons": "Italian", "name": "Italian", "language_id": 4},
    "ja_JP": {
        "buttons": "Japanese",
        "name": "Japanese",
        "language_id": 14,
        "encoding": "shift_jis",  # not sure if this is correct encoding, but seems to be working
        "multibyte": True,
    },
    "ko_KR": {
        "buttons": "Korean",
        "name": "Korean",
        "language_id": 51,
        "encoding": "ksx1001",
        "multibyte": True,
    },
    "nb_NO": {"buttons": "Norwegian", "name": "Norwegian", "language_id": 12},
    "nl_BE": {"buttons": "Dutch", "name": "Dutch", "language_id": 6},
    "nl_NL": {"buttons": "Dutch", "name": "Dutch", "language_id": 5},
    "pt_BR": {
        "buttons": "Portuguese",
        "name": "Portuguese (Brazilian)",
        "language_id": 71,
    },
    "pt_PT": {"buttons": "Portuguese", "name": "Portuguese", "language_id": 10},
    "ru_RU": {
        "buttons": "Russian",
        "name": "Russian",
        "language_id": 49,
        "encoding": "mac_cyrillic",
    },
    "sv_SE": {"buttons": "Swedish", "name": "Swedish", "language_id": 7},
    "zh_CN": {
        "buttons": "Simplified",
        "name": "Simplified Chinese",
        "language_id": 52,
        "encoding": "gb2312",
        "multibyte": True,
    },
    "zh_TW": {
        "buttons": "Traditional",
        "name": "Traditional Chinese",
        "language_id": 53,
        "encoding": "big5",
        "multibyte": True,
    },
}

# Buttons (these come from the SLAResources file which you can find in the SLA
#          SDK on developer.apple.com)
default_buttons = {
    "English": (
        "English",
        "Agree",
        "Disagree",
        "Print",
        "Save",
        'If you agree with the terms of this license, press "Agree" to install the software.  If you do not agree, press "Disagree".',  # noqa; E501
    ),
    "German": (
        "Deutsch",
        "Akzeptieren",
        "Ablehnen",
        "Drucken",
        "Sichern...",
        'Klicken Sie in "Akzeptieren", wenn Sie mit den Bestimmungen des Software-Lizenzvertrags einverstanden sind. Falls nicht, bitte "Ablehnen" anklicken. Sie können die Software nur installieren, wenn Sie "Akzeptieren" angeklickt haben.',  # noqa; E501
    ),
    "Spanish": (
        "Español",
        "Aceptar",
        "No aceptar",
        "Imprimir",
        "Guardar...",
        'Si está de acuerdo con los términos de esta licencia, pulse "Aceptar" para instalar el software. En el supuesto de que no esté de acuerdo con los términos de esta licencia, pulse "No aceptar."',  # noqa; E501
    ),
    "French": (
        "Français",
        "Accepter",
        "Refuser",
        "Imprimer",
        "Enregistrer...",
        'Si vous acceptez les termes de la présente licence, cliquez sur "Accepter" afin d\'installer le logiciel. Si vous n\'êtes pas d\'accord avec les termes de la licence, cliquez sur "Refuser".',  # noqa; E501
    ),
    "Italian": (
        "Italiano",
        "Accetto",
        "Rifiuto",
        "Stampa",
        "Registra...",
        'Se accetti le condizioni di questa licenza, fai clic su "Accetto" per installare il software. Altrimenti fai clic su "Rifiuto".',  # noqa; E501
    ),
    "Japanese": (
        "日本語",
        "同意します",
        "同意しません",
        "印刷する",
        "保存...",
        "本ソフトウエア使用許諾契約の条件に同意される場合には、ソフトウエアをインストールするために「同意します」を押してください。\u3000同意されない場合には、「同意しません」を押してください。",  # noqa; E501
    ),
    "Dutch": (
        "Nederlands",
        "Ja",
        "Nee",
        "Print",
        "Bewaar...",
        "Indien u akkoord gaat met de voorwaarden van deze licentie, kunt u op 'Ja' klikken om de programmatuur te installeren. Indien u niet akkoord gaat, klikt u op 'Nee'.",  # noqa; E501
    ),
    "Russian": (
        "Русский",
        "Согласен",
        "Не согласен",
        "Распечатать",
        "Сохранить",
        "Если вы согласны с условиями данной лицензии, нажмите «Согласен», чтобы установить программное обеспечение. Если вы не согласны, нажмите «Не согласен».",  # noqa; E501
    ),
    "Swedish": (
        "Svensk",
        "Godkänns",
        "Avböjs",
        "Skriv ut",
        "Spara...",
        'Om Du godkänner licensvillkoren klicka på "Godkänns" för att installera programprodukten. Om Du inte godkänner licensvillkoren, klicka på "Avböjs".',  # noqa; E501
    ),
    "Portuguese": (
        "Português",
        "Concordar",
        "Discordar",
        "Imprimir",
        "Salvar...",
        'Se está de acordo com os termos desta licença, pressione "Concordar" para instalar o software. Se não está de acordo, pressione "Discordar".',  # noqa; E501
    ),
    "Simplified Chinese": (
        "汉语",
        "同意",
        "不同意",
        "打印",
        "存储…",
        "如果您同意本许可协议的条款，请按“同意”来安装此软件。如果您不同意，请按“不同意”。",  # noqa; E501
    ),
    "Traditional Chinese": (
        "漢語",
        "同意",
        "不同意",
        "列印",
        "儲存…",
        "如果您同意本許可證裡的條款，請按“同意”以安裝軟體。如果不同意，請按“不同意”。",  # noqa; E501
    ),
    "Danish": (
        "Dansk",
        "Enig",
        "Uenig",
        "Udskriv",
        "Arkiver...",
        "Hvis du accepterer betingelserne i licensaftalen, skal du klikke på “Enig” for at installere softwaren. Klik på “Uenig” for at annullere installeringen.",  # noqa; E501
    ),
    "Finnish": (
        "Suomi",
        "Hyväksyn",
        "En hyväksy",
        "Tulosta",
        "Tallenna…",
        'Hyväksy lisenssisopimuksen ehdot osoittamalla "Hyväksy". Jos et hyväksy sopimuksen ehtoja, osoita "En hyväksy".',  # noqa; E501
    ),
    "Korean": (
        "한국어",
        "동의",
        "동의 안함",
        "프린트",
        "저장...",
        '사용 계약서의 내용에 동의하면, "동의" 단추를 눌러 소프트웨어를 설치하십시오. 동의하지 않는다면, "동의 안함" 단추를 누르십시오.',  # noqa; E501
    ),
    "Norwegian": (
        "Norsk",
        "Enig",
        "Ikke enig",
        "Skriv ut",
        "Arkiver...",
        'Hvis De er enig i bestemmelsene i denne lisensavtalen, klikker De på "Enig"-knappen for å installere programvaren. Hvis De ikke er enig, klikker De på "Ikke enig".',  # noqa; E501
    ),
}

udifrezXMLtemplate = {
    "STR#": [],
    # ?? License text would be included in a block like this:
    # ?? 'TEXT': [
    # ??     {
    # ??         'Attributes': '0x0000',
    # ??         'Data': b'license text',
    # ??         'ID': '5000',
    # ??         'Name': 'English'
    # ??     }
    # ?? ],
    "TMPL": [
        {
            "Attributes": "0x0000",
            "Data": b"\x13Default Language IDDWRD\x05CountOCNT\x04****LSTC\x0bsys lang IDDWRD\x1elocal res ID (offset from 5000DWRD\x102-byte language?DWRD\x04****LSTE",  # noqa: E501
            "ID": "128",
            "Name": "LPic",
        }
    ],
}


# Another implementation in TS:
# https://github.com/argv-minus-one/dmg-license/blob/4268f2e822944fd670c1e197596396f233d6484e/src/makeLicensePlist.ts


def build_license(license_info):
    """Add a license agreement to the specified disk image file, see
    https://developer.apple.com/forums/thread/668084."""
    # Copy the original template
    xml = dict(udifrezXMLtemplate)

    licenses = license_info.get(
        "licenses",
        {"en_US": default_buttons["English"][5].encode("utf-8")},
    )

    lpic = b""
    # The first field is the default language ID.
    lpic += int(5000).to_bytes(2, "big")
    # The second field is the count of language ID to license resource mappings.
    lpic += len(licenses.items()).to_bytes(2, "big")

    for language, license_data in licenses.items():
        if language not in language_info_map:
            raise Exception(
                "Unknown language '"
                + language
                + "'. Valid languages are: "
                + ", ".join(sorted(language_info_map.keys()))
            )

        language_info = language_info_map[language]
        language_buttons = language_info["buttons"]
        language_name = language_info["name"]
        language_id = language_info["language_id"]
        # for simplicity we use the same id for the resource as system language id + 5000
        resource_id = language_id + 5000
        language_encoding = language_info.get("encoding", "mac_roman")
        multibyte_encoding = language_info.get("multibyte_encoding", False)

        if os.path.isfile(license_data):
            mode = "rb" if license_data.endswith(".rtf") else "r"
            with open(license_data, mode=mode) as f:
                license_data = f.read()

        if isinstance(license_data, bytes):
            if license_data.startswith(b"{\\rtf1"):
                licenseDataFormat = "RTF "
            else:
                licenseDataFormat = "TEXT"
        else:
            licenseDataFormat = "TEXT"
            license_data = license_data.encode(language_encoding)

        if licenseDataFormat not in xml:
            xml[licenseDataFormat] = []

        xml[licenseDataFormat].append(
            {
                "Attributes": "0x0000",
                "Data": license_data,
                "ID": str(resource_id),
                "Name": f"{language_name} SLA",
            }
        )

        language_default_buttons = default_buttons.get(
            language_buttons, default_buttons["English"]
        )
        buttons = license_info.get("buttons", {}).get(
            language, language_default_buttons
        )

        assert len(buttons) == 6, "License buttons must have 6 entries."

        buttons = [b.encode(language_encoding) for b in buttons]
        buttons = [len(b).to_bytes(1, "big") + b for b in buttons]
        xml["STR#"].append(
            {
                "Attributes": "0x0000",
                # \x06 is apparently the number of buttons which is always 6
                "Data": b"\x00\x06" + b"".join(buttons),
                "ID": str(resource_id),
                "Name": language_name,
            }
        )

        # Finally, the list of resource ID mappings:
        # Mapping field 1: system language ID
        lpic += language_id.to_bytes(2, "big")
        # Mapping field 2: local resource ID minus 5000
        lpic += int(resource_id - 5000).to_bytes(2, "big")
        # Mapping field 3: 2-byte language?
        lpic += int(1 if multibyte_encoding else 0).to_bytes(2, "big")

    xml["LPic"] = [
        {
            "Attributes": "0x0000",
            "Data": lpic,
            "ID": "5000",
            "Name": "",
        }
    ]
    return xml
