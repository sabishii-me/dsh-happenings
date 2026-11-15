window.__ModuleLoader__.load({
  id: 'dsh-happenings',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const ID = 'happenings';
    const HEALTH = '/dsh-happenings/api/health';

    function Icon() {
      return h('svg', {viewBox:'0 0 24 24', width:20, height:20, fill:'none', stroke:'currentColor', strokeWidth:1.8, 'aria-hidden':true},
        h('rect',{x:3,y:5,width:18,height:16,rx:3}), h('path',{d:'M7 3v4m10-4v4M3 11h18M7 15h4m2 3h4'}));
    }

    // The Host starts the local backend with the plugin, and wrangler needs a few
    // seconds, so "unreachable" only means failed after this budget.
    const START_BUDGET_MS = 90_000;
    const POLL_MS = 1_500;

    function Page({t}) {
      const [phase, setPhase] = React.useState('starting');
      const [nonce, retry] = React.useState(0);
      React.useEffect(() => {
        let cancelled = false;
        let timer = null;
        const deadline = Date.now() + START_BUDGET_MS;
        const probe = async () => {
          try {
            const response = await fetch(HEALTH, {headers:{accept:'application/json'}});
            const value = await response.json().catch(() => null);
            if (value && value.ok === true && value.service === 'happenings') {
              if (!cancelled) setPhase('ready');
              return;
            }
          } catch { /* backend still booting */ }
          if (cancelled) return;
          if (Date.now() > deadline) { setPhase('failed'); return; }
          timer = setTimeout(probe, POLL_MS);
        };
        probe();
        return () => { cancelled = true; if (timer) clearTimeout(timer); };
      }, [nonce]);

      return h('section', {style:{height:'100%', minHeight:0, display:'flex', flexDirection:'column', color:'inherit'}},
        h('header',{style:{display:'flex', alignItems:'center', gap:10, padding:'12px 16px', borderBottom:'1px solid color-mix(in srgb,currentColor 15%,transparent)'}},
          h(Icon), h('strong',null,t('title')), h('span',{style:{fontSize:12, opacity:.65}},t('subtitle'))),
        phase === 'ready'
          ? h('iframe', {src:'/dsh-happenings/app/', title:'Happenings', style:{border:0, width:'100%', flex:1, minHeight:480}})
          : h('div',{style:{padding:24, display:'grid', gap:8}},
              h('p',null, phase === 'starting' ? t('starting') : t('failed')),
              phase === 'failed' ? h('p',{style:{fontSize:12, opacity:.7}}, t('failedHint')) : null,
              phase === 'failed'
                ? h('button',{type:'button', onClick:()=>{setPhase('starting'); retry(x=>x+1);}}, t('retry'))
                : null));
    }

    return {
      inject:['slots','locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(ID, {
          zh:{nav:'Happenings',title:'Happenings',subtitle:'动态活动日历',starting:'正在启动活动服务…',failed:'活动服务没有起来。',failedHint:'插件会自动启动本地后端并复用已在运行的服务；具体原因见仓库 .runtime/happenings-worker.log。',retry:'重试'},
          en:{nav:'Happenings',title:'Happenings',subtitle:'Live event calendar',starting:'Starting the event service…',failed:'The event service did not start.',failedHint:'The plugin starts the local backend itself and reuses a healthy one; see .runtime/happenings-worker.log for the reason.',retry:'Retry'},
          ja:{nav:'Happenings',title:'Happenings',subtitle:'動的イベントカレンダー',starting:'イベントサービスを起動しています…',failed:'イベントサービスが起動しませんでした。',failedHint:'プラグインはローカルバックエンドを自分で起動し、稼働中のものがあれば再利用します。原因は .runtime/happenings-worker.log に出力されます。',retry:'再試行'}
        }), ID + ': dictionaries');
        const t = ctx.locale.bind(ID);
        ctx.slots.inject('main', () => ctx.slots.register({name:'main', key:ID, locale:ID}, props => h(Page, {...props, t})));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({name:'sidebar.panellist', id:ID, order:31, locale:ID, label:() => t('nav')}, Icon));
      }
    };
  }
});
