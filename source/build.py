import pathlib, hashlib, shutil
src = pathlib.Path('src')
s = (src/'index.html').read_text()
for tag, f in [('/*CSS*/','style.css'),('/*DATA*/','data.js'),('/*ENGINE*/','engine.js'),('/*GUIDE*/','guide.js'),('/*UI*/','ui.js')]:
    s = s.replace(tag, (src/f).read_text().replace('</script>','<\\/script>'))
pathlib.Path('dist').mkdir(exist_ok=True)
(pathlib.Path('dist')/'index.html').write_text(s)
# version web app (GitHub Pages) : manifeste, icônes, service worker
head = '''<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#1c140c">
<meta name="description" content="Jeu de négoce et de spéculation dans un archipel noyé de brume.">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Archipel">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" href="icons/favicon.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">'''
p = s.replace('<meta name="viewport" content="width=device-width, initial-scale=1">', head)
reg = '''<script>if ('serviceWorker' in navigator && location.protocol.startsWith('http')) { window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {})); }</script>
</body>'''
p = p.replace('</body>', reg)
version = hashlib.sha1(p.encode()).hexdigest()[:10]
out = pathlib.Path('site'); out.mkdir(exist_ok=True)
(out/'index.html').write_text(p)
(out/'sw.js').write_text(pathlib.Path('pwa/sw.template.js').read_text().replace('__VERSION__', version))
shutil.copy('pwa/manifest.webmanifest', out/'manifest.webmanifest')
shutil.copytree('pwa/icons', out/'icons', dirs_exist_ok=True)
(out/'.nojekyll').write_text('')
print('ok', len(s)//1024, 'KB · web app version', version)
