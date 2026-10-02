import re,sys
def hunks(s):
    return list(re.finditer(r'<<<<<<< [^\n]*\n(.*?)(?:\|\|\|\|\|\|\| [^\n]*\n.*?)?=======\n(.*?)>>>>>>> [^\n]*\n',s,re.S))
def resolve(p, picks, post=None):
    """picks: list per hunk of 'ours'|'theirs'|'both'"""
    s=open(p).read()
    hs=hunks(s)
    assert len(hs)==len(picks),(p,len(hs),len(picks))
    out=[];last=0
    for m,pk in zip(hs,picks):
        out.append(s[last:m.start()])
        o,t=m.group(1),m.group(2)
        out.append({'ours':o,'theirs':t,'both':o+t}[pk])
        last=m.end()
    out.append(s[last:])
    s=''.join(out)
    if post: s=post(s)
    open(p,'w').write(s)
