import {appPath,sitePath} from './site-paths.js';
import {company, services, initialPrompts, followupPrompts, getAnswer, whatsappLink} from './ar1-data.js';

export function createAR1Screen({React}) {
  const h=React.createElement;
  return function AR1Screen({isHeroReady}) {
    const [frame,setFrame]=React.useState(0);
    const [wall,setWall]=React.useState({});
    const slides=['/interativo/media/show.jpg','/interativo/media/aerea.jpg','/interativo/media/entrevista.jpg'];
    React.useEffect(()=>{if(!isHeroReady)return;const timer=setInterval(()=>setFrame(n=>(n+1)%slides.length),6500);return()=>clearInterval(timer)},[isHeroReady]);
    React.useEffect(()=>{
      const layout=()=>{
        const hero=document.getElementById('hero');if(!hero)return;
        const {width,height}=hero.getBoundingClientRect();const scale=Math.max(width/1920,height/1080);
        const x=(width-1920*scale)*.478,y=(height-1080*scale)*.36;
        setWall({'--ar1-wall-x':`${x+357*scale}px`,'--ar1-wall-y':`${y+181*scale}px`,'--ar1-wall-w':`${306*scale}px`,'--ar1-wall-h':`${281*scale}px`,'--ar1-wall-font':`${11*scale}px`});
      };
      layout();window.addEventListener('resize',layout);return()=>window.removeEventListener('resize',layout);
    },[]);
    return h(React.Fragment,null,
      h('div',{className:'ar1-wall-mark','aria-hidden':true,style:wall},h('img',{src:'/interativo/media/logo.png',alt:''}),h('span',null,'PRODUÇÃO AUDIOVISUAL',h('br'),'PODCAST · AO VIVO · DVDs')),
      h('div',{className:'ar1-monitor-content','aria-hidden':true,style:{opacity:isHeroReady?1:0}},
        h('div',{className:'ar1-monitor-scale'},h('div',{className:'ar1-monitor-plane'},
          ...slides.map((src,i)=>h('img',{key:src,src,alt:'',className:i===frame?'is-current':''})),
          h('div',{className:'ar1-monitor-shade'}),
          h('img',{className:'ar1-monitor-logo',src:'/interativo/media/logo.png',alt:''}),
          h('span',{className:'ar1-monitor-caption'},['SHOWS E DVDs','HARAS SOBI','PODCAST'][frame])
        ))),
      h('button',{className:'ar1-monitor-hit','aria-label':'Explorar os serviços no monitor da AR1',title:'Explorar serviços',
        onClick:()=>window.dispatchEvent(new CustomEvent('ar1:explore'))})
    );
  };
}

export function createAR1App({React,Hero,Motion}) {
  const h=React.createElement;
  const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const anim={initial:{opacity:0,y:16},animate:{opacity:1,y:0},transition:{duration:reduced()?0:.4}};
  const storageKey='ar1-films-conversation-v1';
  const readPath=()=>{
    const p=appPath(window.location.pathname)||'/';
    return p==='/experience'?'/servicos':p;
  };

  function External({href,children,className='',download}) {
    return h('a',{href,className,download,target:download?undefined:'_blank',rel:download?undefined:'noopener noreferrer'},children);
  }
  function Arrow(){return h('span',{'aria-hidden':true},'↗')}
  function Eyebrow({children}){return h('p',{className:'ar1-eyebrow'},children)}
  function Image({src,alt,position,lazy=true,className=''}) {
    return h('img',{src,alt,loading:lazy?'lazy':'eager',decoding:'async',className,style:position?{objectPosition:position}:undefined});
  }
  function Logo(){return h('img',{src:'/interativo/media/logo.png',alt:'AR1 Films',width:148,height:49})}

  return function AR1App() {
    const [path,setPath]=React.useState(readPath);
    const [question,setQuestion]=React.useState('');
    const [busy,setBusy]=React.useState(false);
    const [opened,setOpened]=React.useState(false);
    const [messages,setMessages]=React.useState(()=>{
      try{const v=JSON.parse(sessionStorage.getItem(storageKey)||'null');return v&&Date.now()-v.saved<86400000&&Array.isArray(v.messages)?v.messages.slice(-4):[]}catch{return[]}
    });
    const [rotation,setRotation]=React.useState(0);
    const scrollRef=React.useRef(null);
    const pageRef=React.useRef(null);
    const inputRef=React.useRef(null);
    const timerRef=React.useRef(null);

    const navigate=React.useCallback(next=>{
      const url=sitePath(next);
      if(url!==window.location.pathname)history.pushState(null,'',url);
      setPath(next);setOpened(false);
    },[]);
    React.useEffect(()=>{
      const pop=()=>{setPath(readPath());setOpened(false)};
      const explore=()=>navigate('/servicos');
      window.addEventListener('popstate',pop);window.addEventListener('ar1:explore',explore);
      return()=>{window.removeEventListener('popstate',pop);window.removeEventListener('ar1:explore',explore)};
    },[navigate]);
    React.useEffect(()=>{
      try{sessionStorage.setItem(storageKey,JSON.stringify({saved:Date.now(),messages:messages.slice(-4)}))}catch{}
    },[messages]);
    React.useEffect(()=>{
      const timer=setInterval(()=>setRotation(n=>(n+1)%3),7000);
      return()=>{clearInterval(timer);clearTimeout(timerRef.current)};
    },[]);
    React.useEffect(()=>{
      if(pageRef.current)pageRef.current.scrollTop=0;
      const service=services.find(s=>path==='/servicos/'+s.id);
      const name=path==='/servicos'?'Serviços':path==='/contato'?'Contato':service?.name;
      document.title=name?`${name} | AR1 Films`:'AR1 Films | Podcast, transmissões e produções';
      const desc=document.querySelector('meta[name="description"]');
      if(desc)desc.content=service?service.intro:'Produção audiovisual em Goiânia e todo o Brasil. Podcast, transmissões ao vivo, shows, DVDs, filmes, fotografia e Haras SOBI.';
    },[path]);
    React.useEffect(()=>{
      const area=scrollRef.current;
      if(area&&area.lastElementChild)area.scrollTop=Math.max(0,area.lastElementChild.offsetTop-area.offsetTop);
    },[messages,busy]);
    React.useEffect(()=>{
      const key=e=>{if(e.key==='Escape'&&opened){setOpened(false);inputRef.current?.focus()}};
      window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
    },[opened]);

    function internal(href,props={},children){
      return h('a',{...props,href:sitePath(href),onClick:e=>{
        if(!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&e.button===0){e.preventDefault();navigate(href)}
      }},children);
    }
    function send(value){
      const q=String(value).trim().slice(0,1200);
      if(!q||busy)return;
      setQuestion('');setOpened(true);setBusy(true);
      setMessages(old=>[...old.slice(-3),{id:Date.now(),question:q,answer:null}]);
      clearTimeout(timerRef.current);
      timerRef.current=setTimeout(()=>{
        const answer=getAnswer(q);
        setMessages(old=>old.map((m,i)=>i===old.length-1?{...m,answer}:m));setBusy(false);
      },reduced()?0:350);
    }
    function reset(){clearTimeout(timerRef.current);setMessages([]);setBusy(false);setOpened(false);setQuestion('');inputRef.current?.focus()}

    function Card({service:s,compact=false}) {
      return internal('/servicos/'+s.id,{className:'ar1-service-card'+(compact?' is-compact':''),key:s.id},
        h(React.Fragment,null,
          h('div',{className:'ar1-card-image'},h(Image,{src:s.image,alt:s.imageAlt,position:s.imagePosition}),h('span',{className:'ar1-card-number'},s.number)),
          h('div',{className:'ar1-card-copy'},h('h3',null,s.name),h('p',null,s.short),h('span',{className:'ar1-card-action'},'Ver formatos e entregas ',h(Arrow)))
        ));
    }
    function ContactActions({subject='um projeto audiovisual'}) {
      return h('div',{className:'ar1-actions'},
        h(External,{href:whatsappLink(subject),className:'ar1-button is-primary'},'Conversar com a equipe ',h(Arrow)),
        h(External,{href:company.pdf,className:'ar1-button',download:true},'Portfólio de serviços ↓')
      );
    }
    function AgencyNote(){return h('aside',{className:'ar1-agency-note'},
      h('div',null,h(Eyebrow,null,'Para agências'),h('h2',null,'Envie o briefing. A AR1 dimensiona a produção.'),
        h('p',null,'Serviço, objetivo, data, local, referências e formatos de entrega ajudam a construir uma proposta clara.')),
      internal('/contato',{className:'ar1-text-link'},h(React.Fragment,null,'Preparar meu projeto ',h(Arrow))));}
    function ServicesPage(){return h('div',{className:'ar1-content'},
      h(Motion.div,anim,h(Eyebrow,null,'AR1 Films · Serviços'),h('h1',null,'O que vamos produzir juntos?'),
        h('p',{className:'ar1-lead'},'Podcast, transmissão ao vivo e shows/DVDs em destaque. Explore cada frente para conhecer formatos, entregas e possibilidades.')),
      h('h2',{className:'ar1-sr-only'},'Serviços disponíveis'),
      h('div',{className:'ar1-services-grid'},...services.map(s=>Card({service:s}))),
      AgencyNote(),h('footer',{className:'ar1-inner-footer'},h('span',null,company.address),h('span',null,'AR1 Films · 2026'))
    );}
    function ServicePage({service:s}){
      return h('article',{className:'ar1-content ar1-detail'},
        internal('/servicos',{className:'ar1-back'},'← Todos os serviços'),
        h(Motion.div,anim,h(Eyebrow,null,`AR1 Films · ${s.number}`),h('h1',null,s.name),h('p',{className:'ar1-lead'},s.intro)),
        h('figure',{className:'ar1-detail-hero'},h(Image,{src:s.image,alt:s.imageAlt,position:s.imagePosition,lazy:false}),h('figcaption',null,s.imageAlt)),
        h('div',{className:'ar1-detail-columns'},
          h('section',null,h(Eyebrow,null,'Formatos'),h('h2',null,'Quando faz sentido'),h('ul',null,...s.formats.map(x=>h('li',{key:x},x)))),
          h('section',null,h(Eyebrow,null,'Entregas'),h('h2',null,'O que pode entrar no projeto'),h('ul',null,...s.deliveries.map(x=>h('li',{key:x},x))))),
        h('p',{className:'ar1-detail-note'},s.text),
        ContactActions({subject:s.name}),
        h('section',{className:'ar1-gallery','aria-label':'Imagens de '+s.name},...s.gallery.map(([src,alt])=>h('figure',{key:src},h(Image,{src,alt}),h('figcaption',null,alt)))),
        h('section',{className:'ar1-related'},h(Eyebrow,null,'Continue explorando'),h('h2',null,'Conecte as frentes do projeto.'),
          h('div',{className:'ar1-services-grid'},...s.related.map(id=>Card({service:services.find(s=>s.id===id),compact:true})))),
        h('footer',{className:'ar1-inner-footer'},h('span',null,company.address),h('span',null,'Escopo e agenda confirmados pela equipe.'))
      );
    }
    function ContactPage(){return h('div',{className:'ar1-content ar1-contact-page'},
      h(Motion.div,anim,h(Eyebrow,null,'Próximo passo'),h('h1',null,'Conte o que precisa acontecer.'),
        h('p',{className:'ar1-lead'},'A equipe AR1 conversa sobre a necessidade, confirma a viabilidade e organiza a proposta.')),
      h('div',{className:'ar1-contact-columns'},
        h('section',{className:'ar1-briefing'},h(Eyebrow,null,'Para o primeiro contato'),h('h2',null,'Um briefing simples já ajuda.'),
          h('ol',null,...['Serviço e objetivo do projeto','Data, local e duração previstos','Referências visuais e de conteúdo','Formatos, canais e prazo de entrega','Verba disponível, quando definida'].map(x=>h('li',{key:x},x))),
          h('p',null,'A proposta define escopo, equipe, cronograma, responsabilidades, entregas e investimento.')),
        h('section',{className:'ar1-contact-details'},h(Eyebrow,null,'Fale com a AR1'),
          h('a',{href:'tel:+5562981252338',className:'ar1-big-phone'},company.phone),
          ContactActions({}),h('a',{href:'mailto:'+company.email,className:'ar1-contact-email'},company.email),
          h('p',null,company.address),h('p',null,'Haras SOBI · '+company.haras),
          h(External,{href:company.site,className:'ar1-text-link'},'Visitar ar1films.com ',h(Arrow)))),
      h('figure',{className:'ar1-contact-landscape'},h(Image,{src:'/interativo/media/bosque.jpg',alt:'Bosque e jardins do Haras SOBI'}),h('figcaption',null,'Haras SOBI · Locação e produção'))
    );}
    function Answer({message:m}){
      const answer=m.answer;
      return h(Motion.article,{...anim,className:'ar1-message',key:m.id},
        h('p',{className:'ar1-question'},m.question),
        h('div',{className:'ar1-answer-head'},h('img',{src:'/interativo/media/cobre.png',alt:'',width:36,height:24}),h('span',null,'AR1 FILMS')),
        answer?h(React.Fragment,null,
          h('div',{'aria-live':'polite'},h('h2',null,answer.title),...answer.paragraphs.map(x=>h('p',{key:x,className:'ar1-answer-paragraph'},x))),
          answer.ids.length>0&&h('div',{className:'ar1-services-grid'},...answer.ids.map(id=>Card({service:services.find(s=>s.id===id),compact:true}))),
          answer.contact&&ContactActions({})
        ):h('p',{className:'ar1-busy',role:'status'},'Consultando os serviços',h('span',{'aria-hidden':true},' · · ·'))
      );
    }

    const activeService=services.find(s=>path==='/servicos/'+s.id);
    const isHome=path==='/';
    const suggestions=messages.length?followupPrompts:initialPrompts;
    return h('div',{className:'ar1-root '+(isHome?'is-home':'is-page')+(opened?' is-conversation':'')},
      h('a',{href:'#ar1-main',className:'ar1-skip'},'Pular para o conteúdo'),
      h('div',{className:'ar1-scene'},h(Hero)),
      h('div',{className:'ar1-scene-shade','aria-hidden':true}),
      h('header',{className:'ar1-header'},
        internal('/',{className:'ar1-brand','aria-label':'AR1 Films, início'},h(Logo)),
        h('div',{className:'ar1-live-badge'},h('span',{className:'ar1-live-dot','aria-hidden':true}),h('span',null,'EM CENA'),
          h(Motion.span,{key:rotation,initial:{opacity:0,y:8},animate:{opacity:1,y:0},transition:{duration:reduced()?0:.35}},['Podcast','Transmissões ao vivo','Shows e DVDs'][rotation])),
        h('nav',{'aria-label':'Navegação principal'},
          internal('/servicos',{'aria-current':path.startsWith('/servicos')?'page':undefined},'Serviços'),
          h(External,{href:company.pdf,download:true,className:'ar1-nav-pdf'},'Portfólio PDF ↓'),
          internal('/contato',{className:'ar1-nav-contact','aria-current':path==='/contato'?'page':undefined},h(React.Fragment,null,'Contato ',h(Arrow))))),
      isHome?h(React.Fragment,null,
        h('main',{id:'ar1-main',className:'ar1-home-copy'},h('h1',null,'AR1 Films · Produção audiovisual'),h('p',null,'Podcast, ao vivo e produções que continuam depois da gravação.')),
        h('div',{className:'ar1-host-badge'},h('span',{className:'ar1-host-line','aria-hidden':true}),h('span',null,'ANFITRIÃO VIRTUAL · AR1 FILMS')),
        h('div',{className:'ar1-focus-shade'+(opened?' is-active':''),'aria-hidden':true}),
        opened&&h('section',{className:'ar1-conversation','aria-label':'Conversa sobre os serviços da AR1'},
          h('div',{className:'ar1-conversation-toolbar'},h('span',null,'CONVERSA COM A AR1'),h('button',{type:'button','aria-label':'Fechar conversa',onClick:()=>{setOpened(false);inputRef.current?.focus()}},'Fechar ',h('span',{'aria-hidden':true},'×'))),
          h('div',{className:'ar1-conversation-scroll',ref:scrollRef},...messages.map(m=>Answer({message:m})))),
        h('div',{className:'ar1-composer'},
          messages.length>0&&!opened&&h('button',{className:'ar1-resume',onClick:()=>setOpened(true)},'Retomar conversa ↑'),
          h('form',{className:'ar1-input-shell',onSubmit:e=>{e.preventDefault();send(question)}},
            messages.length>0&&h('button',{type:'button',className:'ar1-reset',onClick:reset,'aria-label':'Reiniciar conversa',title:'Reiniciar conversa'},'↻'),
            h('label',{htmlFor:'ar1-question',className:'ar1-sr-only'},'Qual serviço você procura?'),
            h('input',{ref:inputRef,id:'ar1-question',value:question,onChange:e=>setQuestion(e.target.value),placeholder:'Conte o que você quer produzir…',maxLength:1200,autoComplete:'off',disabled:busy}),
            h('button',{type:'submit',className:'ar1-send',disabled:busy||!question.trim(),'aria-label':'Enviar pergunta'},h('svg',{viewBox:'0 0 24 24',width:23,height:23,fill:'none','aria-hidden':true},h('path',{d:'m3 3 18 7-8 3-3 8-7-18Zm18 7L10 14',stroke:'currentColor',strokeWidth:1.4,strokeLinejoin:'round'})))),
          h('div',{className:'ar1-suggestions','aria-label':'Perguntas sugeridas'},...suggestions.map(q=>h('button',{key:q,type:'button',onClick:()=>send(q),disabled:busy},q))),
          h('div',{className:'ar1-home-links'},internal('/servicos',{},'Ver todos os serviços'),h('span',{'aria-hidden':true},'·'),h(External,{href:whatsappLink()},'Falar com a equipe ↗')))
      ):h('main',{id:'ar1-main',className:'ar1-page',ref:pageRef},
        path==='/servicos'?ServicesPage():path==='/contato'?ContactPage():activeService?ServicePage({service:activeService}):
          h('div',{className:'ar1-content'},h(Eyebrow,null,'AR1 Films'),h('h1',null,'Encontre o serviço para o seu projeto.'),h('p',{className:'ar1-lead'},'Explore as frentes da AR1 ou converse com a equipe.'),internal('/servicos',{className:'ar1-button is-primary'},'Ver serviços'),ContactActions({}))
      )
    );
  };
}
