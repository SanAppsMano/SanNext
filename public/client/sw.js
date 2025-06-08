self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Sua vez!';
  const options = {
    body: data.body || 'Dirija-se ao atendimento.',
    icon: '/img/icon-sannext.png'
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
