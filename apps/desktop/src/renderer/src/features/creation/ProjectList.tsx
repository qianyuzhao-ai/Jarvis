import { useState } from 'react';
import { Plus, Search, Workflow } from 'lucide-react';
import type { Project } from './types';
export function ProjectList({
  projects,
  onCreate,
  onOpen,
}: {
  projects: Project[];
  onCreate: () => void;
  onOpen: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('recent');
  const filtered = projects
    .filter((p) => p.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
    .sort((a, b) => (sort === 'recent' ? b.updatedAt - a.updatedAt : a.name.localeCompare(b.name)));
  return (
    <section className="project-page">
      <div className="page-heading">
        <div>
          <h1>我的项目</h1>
          <p>每个项目，都是一张独立的无限画布。</p>
        </div>
        <button className="primary-button" onClick={onCreate}>
          <Plus size={16} />
          新建项目
        </button>
      </div>
      <div className="project-filters">
        <label className="search-field">
          <Search size={16} />
          <input
            aria-label="搜索项目"
            placeholder="搜索项目"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <span>{filtered.length} 个项目</span>
        <select aria-label="项目排序" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="recent">最近编辑</option>
          <option value="name">名称排序</option>
        </select>
      </div>
      {filtered.length ? (
        <div className="project-table">
          <div className="project-table-head">
            <span>项目名称</span>
            <span>画布内容</span>
            <span>最后编辑</span>
          </div>
          {filtered.map((project) => (
            <button
              key={project.id}
              data-testid="project-row"
              className="project-row"
              onClick={() => onOpen(project.id)}
            >
              <span className="project-info">
                <span className="project-thumbnail">
                  <Workflow size={28} />
                </span>
                <span>
                  <strong>{project.name}</strong>
                  <small>图像与视频创作画布</small>
                </span>
              </span>
              <span>{project.nodes.length} 个节点</span>
              <time>{new Date(project.updatedAt).toLocaleDateString('zh-CN')}</time>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty-projects">
          <Workflow size={36} />
          <h2>{query ? '没有找到匹配的项目' : '开始你的第一个创作项目'}</h2>
          <p>{query ? '试试其他关键词。' : '创建画布，添加图像或视频节点，整理你的创作想法。'}</p>
          {!query && (
            <button className="secondary-button" onClick={onCreate}>
              创建项目
            </button>
          )}
        </div>
      )}
    </section>
  );
}
