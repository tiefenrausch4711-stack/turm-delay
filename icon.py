import math, os, sys
from PIL import Image, ImageDraw
# Weiß gefüllte Kamera, das Objektiv ist farbig mit weißen Uhrzeigern.
# Symbole der Web-App:      python icon.py <Zielordner> <Hintergrund> [Objektiv], Farben als Hex ohne #
#   Normale App: python icon.py app 3a434d   Test-App: python icon.py test 3a434d
# Symbol der Android-App:   python icon.py android <Variante> <Hintergrund> <Kamera>, etwa python icon.py android labtest ffffff 8fb9ad
#   Kamera und Zeiger in der Farbe der Kamera, das Objektiv in der Hintergrundfarbe.
#   Android legt das Symbol selbst in seine Form, Kreis oder abgerundetes Quadrat. Dafür entsteht die Kamera
#   ohne Hintergrund, der Hintergrund kommt aus der Farbe icon_bg der Variante.
SC=0.90                      # Größe der ganzen Kamera gegenüber dem Entwurf, bis Stand 45 0.84
OX,OY=256,259                # Mitte der Kamera im Entwurf, landet genau in der Bildmitte
S=4; N=512*S
FG=(255,255,255,255)

def camera(bg, lens, fg=FG, hands=FG):
    """Kamera auf 512 x 512. Ist bg durchsichtig, bleibt alles außer der Kamera durchsichtig."""
    def X(v): return int(round((256+(v-OX)*SC)*S))
    def Y(v): return int(round((256+(v-OY)*SC)*S))
    def L(v): return int(round(v*SC*S))
    img=Image.new('RGBA',(N,N),bg); d=ImageDraw.Draw(img)
    # Gehäuse und Sucherhöcker, beide mit runden Ecken
    bx0,by0,bx1,by1=100,170,412,390; br=44
    hx0,hy0,hx1=170,124,306; hr=22
    d.rounded_rectangle([X(bx0),Y(by0),X(bx1),Y(by1)],L(br),fill=fg)
    d.rounded_rectangle([X(hx0),Y(hy0),X(hx1),Y(by0+40)],L(hr),fill=fg)
    # Weiche Übergänge zwischen Höcker und Gehäuse statt spitzer Innenecken
    f=16
    d.rectangle([X(hx0-f),Y(by0-f),X(hx0),Y(by0)],fill=fg)
    d.ellipse([X(hx0-2*f),Y(by0-2*f),X(hx0),Y(by0)],fill=bg)
    d.rectangle([X(hx1),Y(by0-f),X(hx1+f),Y(by0)],fill=fg)
    d.ellipse([X(hx1),Y(by0-2*f),X(hx1+2*f),Y(by0)],fill=bg)
    # Uhr als Objektiv, farbig mit weißen Zeigern
    cx,cy=256,282; R=96
    d.ellipse([X(cx-R),Y(cy-R),X(cx+R),Y(cy+R)],fill=lens)
    def hand(x2,y2,w):
        d.line([X(cx),Y(cy),X(x2),Y(y2)],fill=hands,width=L(w))
        for x,y in((cx,cy),(x2,y2)):
            d.ellipse([X(x-w/2),Y(y-w/2),X(x+w/2),Y(y+w/2)],fill=hands)
    hand(cx,cy-56,15)
    a=math.radians(30); hand(cx+42*math.cos(a),cy+42*math.sin(a),15)
    return img.resize((512,512),Image.LANCZOS)

rgb=lambda h: tuple(bytes.fromhex(h))+(255,)
if sys.argv[1]=='android':
    flavor=sys.argv[2]; bg=rgb(sys.argv[3]); cam=rgb(sys.argv[4])
    res=f'android/laglab/src/{flavor}/res/mipmap-xxxhdpi'
    # Vordergrund mit 108 dp, davon zeigt Android die mittleren 72 dp. Die Kamera sitzt in diesen 72 dp
    # so groß wie im Symbol der Web-App.
    fg=Image.new('RGBA',(768,768),(0,0,0,0))
    fg.paste(camera((0,0,0,0),bg,cam,cam),(128,128))
    fg.resize((432,432),Image.LANCZOS).save(f'{res}/ic_launcher_foreground.png',optimize=True)
    camera(bg,bg,cam,cam).convert('RGB').resize((192,192),Image.LANCZOS).save(f'{res}/ic_launcher.png',optimize=True)
else:
    out=sys.argv[1]; bg=rgb(sys.argv[2]) if len(sys.argv)>2 else (17,32,62,255)
    lens=rgb(sys.argv[3]) if len(sys.argv)>3 else bg
    img=camera(bg,lens).convert('RGB')
    for size in (512,192):
        img.resize((size,size),Image.LANCZOS).save(f'{out}/icon-{size}.png',optimize=True)
