#!/usr/bin/env python3
"""Build a Debian archive from electron-builder's unpacked Linux application.

On macOS, electron-builder can occasionally leave a BSD ar symbol table instead
of a Debian package. This script produces the standard three-member ar archive.
"""
from pathlib import Path
from tempfile import TemporaryDirectory
import io
import json
import os
import tarfile

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
APP = DIST / 'linux-unpacked'
META = json.loads((ROOT / 'package.json').read_text())
VERSION = META['version']
OUTPUT = DIST / f'processing-studio_{VERSION}_amd64.deb'

if not (APP / 'processing-studio').is_file():
    raise SystemExit('Missing linux-unpacked application')

size_kib = sum(p.lstat().st_size for p in APP.rglob('*') if p.is_file()) // 1024
control = f'''Package: processing-studio
Version: {VERSION}
Section: devel
Priority: optional
Architecture: amd64
Maintainer: FrogeeSoft <frogeesoft.team@gmail.com>
Installed-Size: {size_kib}
Description: Processing Studio IDE for mobile development
 Processing editor with device emulator and Android project export.
'''.encode()
desktop = b'''[Desktop Entry]
Type=Application
Name=Processing Studio
Comment=IDE for Processing and Android projects
Exec=/opt/processing-studio/processing-studio %U
Icon=processing-studio
Categories=Development;IDE;
Terminal=false
'''


def info(name, data, mode=0o644):
    item = tarfile.TarInfo(name)
    item.size = len(data)
    item.mode = mode
    item.uid = item.gid = 0
    item.uname = item.gname = 'root'
    return item


def filter_owner(item):
    item.uid = item.gid = 0
    item.uname = item.gname = 'root'
    if item.name.endswith('/chrome-sandbox'):
        item.mode = 0o4755
    return item


def write_member(out, name, source):
    size = source.stat().st_size
    if len(name) > 15:
        raise ValueError('ar member name too long')
    header = f'{name:<16}{0:<12}{0:<6}{0:<6}{100644:<8}{size:<10}`\n'.encode('ascii')
    assert len(header) == 60
    out.write(header)
    with source.open('rb') as inp:
        while chunk := inp.read(8 * 1024 * 1024):
            out.write(chunk)
    if size & 1:
        out.write(b'\n')


with TemporaryDirectory() as temp:
    temp = Path(temp)
    binary = temp / 'debian-binary'
    binary.write_bytes(b'2.0\n')
    control_tar = temp / 'control.tar.gz'
    with tarfile.open(control_tar, 'w:gz', compresslevel=6) as archive:
        archive.addfile(info('./control', control), io.BytesIO(control))
    data_tar = temp / 'data.tar.gz'
    with tarfile.open(data_tar, 'w:gz', compresslevel=6) as archive:
        archive.add(APP, arcname='./opt/processing-studio', recursive=True, filter=filter_owner)
        archive.addfile(info('./usr/share/applications/processing-studio.desktop', desktop), io.BytesIO(desktop))
        link = tarfile.TarInfo('./usr/bin/processing-studio')
        link.type = tarfile.SYMTYPE
        link.linkname = '/opt/processing-studio/processing-studio'
        link.mode = 0o777
        link.uid = link.gid = 0
        link.uname = link.gname = 'root'
        archive.addfile(link)
        for icon in sorted((ROOT / 'build' / 'icons').glob('*x*.png')):
            size = icon.stem
            archive.add(icon, arcname=f'./usr/share/icons/hicolor/{size}/apps/processing-studio.png', filter=filter_owner)
    pending = OUTPUT.with_suffix('.deb.pending')
    with pending.open('wb') as out:
        out.write(b'!<arch>\n')
        write_member(out, 'debian-binary', binary)
        write_member(out, 'control.tar.gz', control_tar)
        write_member(out, 'data.tar.gz', data_tar)
    pending.replace(OUTPUT)
print(f'Built {OUTPUT} ({OUTPUT.stat().st_size} bytes)')
