export const MATERIAL_LIBRARIES = [['audio','听力'],['book','阅读'],['course','课程'],['lesson','精选视频'],['link','我的收集']] as const
export interface MaterialBrowseState { library: string; collectionId: string; category: string; query: string; purpose: string; level: string; sort: string; page: number }
export const defaultMaterialBrowse: MaterialBrowseState = { library: 'all', collectionId: '', category: '', query: '', purpose: '', level: '', sort: 'title', page: 1 }
