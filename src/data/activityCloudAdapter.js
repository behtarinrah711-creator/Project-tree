export const activityCloudAdapter = {
  syncProjectActivities(project, { windowRef = globalThis.window } = {}){
    if(!project?.id || !project.ownerUid) return Promise.resolve({ ok:true, skipped:true });
    const firebase = windowRef?.firebase;
    if(!firebase?.auth || !firebase?.firestore) return Promise.resolve({ ok:true, skipped:true });
    const user = firebase.auth().currentUser;
    if(!user) return Promise.resolve({ ok:true, skipped:true });

    const activities = Array.isArray(project.activityTemplates) ? project.activityTemplates : [];
    return firebase.firestore()
      .collection('projects')
      .doc(project.id)
      .set({ activityTemplates: activities }, { merge:true })
      .then(() => ({ ok:true }))
      .catch(error => ({ ok:false, error }));
  },
};
