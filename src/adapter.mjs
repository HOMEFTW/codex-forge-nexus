// The external plugin uses only the public, source-checked Forge SDK.
export function createAdapter(forge) {
  if (forge?.apiVersion !== 4 || !forge.nexus?.request || !forge.nexus.connect || !forge.nexus.disconnect) throw Error('请升级到 Forge 0.6.1 或兼容的 API 4 版本。');
  return {
    request(channel, { method, args = {} } = {}) {
      if (channel !== 'nexus') throw Error('未知插件请求');
      if (method === 'connect') return forge.nexus.connect();
      if (method === 'disconnect') return forge.nexus.disconnect(args.vaultId);
      if (method === 'openExternal') return forge.browser.open(args.url);
      return forge.nexus.request(method, args);
    },
  };
}
