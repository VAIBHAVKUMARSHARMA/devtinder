import { useState, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { X, Plus, Save, User, Pencil, ExternalLink, Mail, Camera, Sparkles, Loader2 } from 'lucide-react';
import { FaLinkedinIn, FaGithub } from 'react-icons/fa';
import { updateUserProfile, clearError } from '@/store/slices/authSlice';
import { optimizeBio } from '../services/aiService';

const ProfilePage = () => {
  const dispatch = useDispatch();
  const { user, loading, error } = useSelector((state) => state.auth);

  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    bio: '',
    skills: [],
    githubUrl: '',
    linkedinUrl: '',
    role: '',
    profilePicture: null,
    bannerUrl: null,
    projects: []
  });

  const [previewImage, setPreviewImage] = useState(null);
  const [previewBanner, setPreviewBanner] = useState(null);
  const fileInputRef = useRef(null);
  const bannerInputRef = useRef(null);
  const projectImageRef = useRef(null); // Ref for project image input

  const [newSkill, setNewSkill] = useState('');
  const [newProject, setNewProject] = useState({ title: '', description: '', link: '' });
  const [successMessage, setSuccessMessage] = useState('');
  const [isGeneratingBio, setIsGeneratingBio] = useState(false);

  const handleOptimizeBio = async () => {
    if (formData.skills.length === 0) {
      alert("Please add some skills first so the AI knows what to write!");
      return;
    }

    setIsGeneratingBio(true);
    try {
      const result = await optimizeBio({
        skills: formData.skills,
        role: formData.role,
        experience: "Intermediate" // Defaulting to intermediate for now
      });

      setFormData(prev => ({ ...prev, bio: result.bio }));
    } catch (error) {
      console.error("Bio Check:", error);
      alert("AI failed: " + error);
    } finally {
      setIsGeneratingBio(false);
    }
  };

  // Initialize form with user data
  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        bio: user.bio || '',
        skills: user.skills || [],
        githubUrl: user.githubUrl || '',
        linkedinUrl: user.linkedinUrl || '',
        role: user.role || '',
        profilePicture: user.profilePicture || '',
        bannerUrl: user.bannerUrl || '',
        projects: user.projects || []
      });
      setPreviewImage(user.profilePicture);
      setPreviewBanner(user.bannerUrl);
    }
  }, [user]);

  // Clear success message after 3 seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage('');
        setIsEditing(false); // Return to view mode after successful update
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Clear error when component unmounts
  useEffect(() => {
    return () => {
      if (error) dispatch(clearError());
    };
  }, [dispatch, error]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) dispatch(clearError());
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        alert("File size should be less than 5MB");
        return;
      }

      setFormData(prev => ({ ...prev, profilePicture: file }));

      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleBannerChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        alert("File size should be less than 5MB");
        return;
      }

      setFormData(prev => ({ ...prev, bannerUrl: file }));

      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewBanner(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current.click();
  };

  const triggerBannerInput = () => {
    bannerInputRef.current.click();
  };

  const handleAddSkill = () => {
    if (newSkill.trim() && !formData.skills.includes(newSkill.trim())) {
      setFormData((prev) => ({
        ...prev,
        skills: [...prev.skills, newSkill.trim()],
      }));
      setNewSkill('');
    }
  };

  const handleRemoveSkill = (skillToRemove) => {
    setFormData((prev) => ({
      ...prev,
      skills: prev.skills.filter((skill) => skill !== skillToRemove),
    }));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddSkill();
    }
  };

  const handleAddProject = () => {
    if (newProject.title.trim()) {
      setFormData(prev => ({
        ...prev,
        projects: [...prev.projects, newProject]
      }));
      setNewProject({ title: '', description: '', link: '', imageFile: null, imagePreview: null });
      if (projectImageRef.current) projectImageRef.current.value = ''; // Reset file input
    }
  };

  const handleProjectImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewProject(prev => ({ ...prev, imageFile: file, imagePreview: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveProject = (index) => {
    setFormData(prev => ({
      ...prev,
      projects: prev.projects.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    // Create FormData for file upload
    const dataToSend = new FormData();
    dataToSend.append('name', formData.name);
    dataToSend.append('bio', formData.bio || ''); // Send empty string if bio is missing

    if (formData.githubUrl) dataToSend.append('githubUrl', formData.githubUrl);
    if (formData.linkedinUrl) dataToSend.append('linkedinUrl', formData.linkedinUrl);

    // Append projects and handle images
    if (formData.projects) {
      let imageCounter = 0;
      const projectsPayload = formData.projects.map(p => {
        if (p.imageFile instanceof File) {
          dataToSend.append('projectImages', p.imageFile);
          const placeholder = `UPLOAD_INDEX_${imageCounter}`;
          imageCounter++;
          // Create a clean object without the raw file/preview for the JSON payload
          return {
            title: p.title,
            description: p.description,
            link: p.link,
            image: placeholder
          };
        }
        // Return existing project data (excluding temp fields if any)
        return {
          title: p.title,
          description: p.description,
          link: p.link,
          image: p.image
        };
      });
      dataToSend.append('projects', JSON.stringify(projectsPayload));
    }

    // Append skills individually
    formData.skills.forEach(skill => {
      dataToSend.append('skills', skill);
    });

    // Only append profile picture if it's a File object (new upload)
    if (formData.profilePicture instanceof File) {
      dataToSend.append('profilePicture', formData.profilePicture);
    }

    // Only append banner if it's a File object (new upload)
    if (formData.bannerUrl instanceof File) {
      dataToSend.append('bannerUrl', formData.bannerUrl);
    }

    dispatch(updateUserProfile(dataToSend))
      .then((resultAction) => {
        if (updateUserProfile.fulfilled.match(resultAction)) {
          setSuccessMessage('Profile updated successfully!');
        }
      });
  };

  if (!user) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">My Profile</h1>
      </div>

      <div className="animate-in fade-in duration-500">
        <Card className="overflow-hidden">
          <div className="h-40 relative bg-gradient-to-r from-primary/20 to-primary/40">
            {previewBanner && (
              <img
                src={previewBanner}
                alt="Banner"
                className="w-full h-full object-cover"
              />
            )}
            {isEditing && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="absolute top-4 right-4"
                onClick={triggerBannerInput}
              >
                <Camera className="h-4 w-4 mr-2" />
                Edit Banner
              </Button>
            )}
            <input
              type="file"
              ref={bannerInputRef}
              onChange={handleBannerChange}
              className="hidden"
              accept="image/*"
            />
          </div>
          <div className="relative px-6">
            <Avatar className="absolute -top-16 border-4 border-background w-32 h-32">
              <AvatarImage src={user.profilePicture} alt={user.name} />
              <AvatarFallback>{user.name?.[0]}</AvatarFallback>
            </Avatar>
          </div>

          <CardHeader className="pt-20 flex flex-row items-start justify-between">
            <div>
              <CardTitle className="text-2xl">{user.name}</CardTitle>
              <CardDescription>{user.role || 'Developer'}</CardDescription>
            </div>
            {!isEditing && (
              <Button onClick={() => setIsEditing(true)} variant="outline" className="flex items-center gap-2">
                <Pencil className="h-4 w-4" />
                Edit Profile
              </Button>
            )}

            {/* Hidden file input for image upload */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageChange}
              className="hidden"
              accept="image/*"
            />
          </CardHeader>

          <CardContent>
            {error && (
              <Alert variant="destructive" className="mb-6">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {successMessage && (
              <Alert className="mb-6 bg-green-50 text-green-700 border-green-200">
                <AlertDescription>{successMessage}</AlertDescription>
              </Alert>
            )}

            {isEditing ? (
              // Edit Form
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="name" className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Full Name
                  </Label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="Your full name"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>Profile Picture</Label>
                  <div className="flex items-center gap-4">
                    <Avatar className="w-20 h-20 border-2 border-muted">
                      <AvatarImage src={previewImage} />
                      <AvatarFallback>{formData.name?.[0]}</AvatarFallback>
                    </Avatar>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={triggerFileInput}
                    >
                      <Camera className="h-4 w-4 mr-2" />
                      Change Photo
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="bio">About</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                      onClick={handleOptimizeBio}
                      disabled={isGeneratingBio}
                    >
                      {isGeneratingBio ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Sparkles className="h-3 w-3 mr-1" />
                      )}
                      {isGeneratingBio ? "Writing..." : "Auto-Generate Bio"}
                    </Button>
                  </div>
                  <Textarea
                    id="bio"
                    name="bio"
                    value={formData.bio}
                    onChange={handleChange}
                    placeholder="Tell us about yourself"
                    className="min-h-[100px]"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Skills</Label>
                  <div className="flex gap-2">
                    <Input
                      value={newSkill}
                      onChange={(e) => setNewSkill(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Add a skill (e.g. React, Node.js)"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      onClick={handleAddSkill}
                      disabled={!newSkill.trim()}
                    >
                      <Plus className="h-4 w-4" />
                      Add
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-3">
                    {formData.skills.map((skill) => (
                      <div
                        key={skill}
                        className="flex items-center gap-1 px-3 py-1 rounded-full bg-primary/10 text-primary"
                      >
                        <span>{skill}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveSkill(skill)}
                          className="text-primary/70 hover:text-primary"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    {formData.skills.length === 0 && (
                      <p className="text-sm text-muted-foreground">No skills added yet</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="githubUrl" className="flex items-center gap-2">
                    <FaGithub className="h-4 w-4" />
                    GitHub URL
                  </Label>
                  <Input
                    id="githubUrl"
                    name="githubUrl"
                    value={formData.githubUrl}
                    onChange={handleChange}
                    placeholder="https://github.com/yourusername"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="linkedinUrl" className="flex items-center gap-2">
                    <FaLinkedinIn className="h-4 w-4" />
                    LinkedIn URL
                  </Label>
                  <Input
                    id="linkedinUrl"
                    name="linkedinUrl"
                    value={formData.linkedinUrl}
                    onChange={handleChange}
                    placeholder="https://linkedin.com/in/yourusername"
                  />
                </div>

                <div className="space-y-4">
                  <Label>Projects</Label>
                  <div className="space-y-4 border p-4 rounded-md">
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="Project Title"
                        value={newProject.title}
                        onChange={(e) => setNewProject({ ...newProject, title: e.target.value })}
                      />
                      <Input
                        placeholder="Link (optional)"
                        value={newProject.link}
                        onChange={(e) => setNewProject({ ...newProject, link: e.target.value })}
                      />
                    </div>
                    <Textarea
                      placeholder="Project Description"
                      value={newProject.description}
                      onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                    />
                    <div className="flex items-center gap-2">
                      <Input
                        type="file"
                        accept="image/*"
                        ref={projectImageRef}
                        onChange={handleProjectImageChange}
                        className="cursor-pointer"
                      />
                      {newProject.imagePreview && (
                        <div className="w-10 h-10 rounded overflow-hidden border">
                          <img src={newProject.imagePreview} alt="Preview" className="w-full h-full object-cover" />
                        </div>
                      )}
                    </div>
                    <Button type="button" onClick={handleAddProject} disabled={!newProject.title.trim()} variant="secondary" className="w-full">
                      <Plus className="w-4 h-4 mr-2" /> Add Project
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {formData.projects.map((project, index) => (
                      <div key={index} className="flex justify-between items-start border p-3 rounded-md bg-muted/20">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold">{project.title}</h4>
                            {(project.image || project.imagePreview) && (
                              <Badge variant="secondary" className="text-xs">Image</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{project.description}</p>
                          {project.link && <a href={project.link} target="_blank" className="text-xs text-primary hover:underline">{project.link}</a>}
                        </div>
                        <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveProject(index)}>
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-4">
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={loading}
                  >
                    {loading ? 'Saving...' : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save Changes
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setIsEditing(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              // Profile View
              <div className="space-y-6">
                {/* About Section */}
                <div>
                  <h3 className="font-medium mb-2 flex items-center gap-2">
                    <User className="h-4 w-4" />
                    About
                  </h3>
                  <p className="text-muted-foreground">
                    {user.bio || 'No bio provided. Click Edit Profile to add information about yourself.'}
                  </p>
                </div>

                {/* Email Section */}
                <div>
                  <h3 className="font-medium mb-2 flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email
                  </h3>
                  <p className="text-muted-foreground">{user.email}</p>
                </div>

                {/* Skills Section */}
                {user.skills?.length > 0 && (
                  <div>
                    <h3 className="font-medium mb-2">Skills</h3>
                    <div className="flex flex-wrap gap-2">
                      {user.skills.map((skill) => (
                        <span
                          key={skill}
                          className="px-3 py-1 text-sm rounded-full bg-primary/10 text-primary"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Social Links */}
                <div className="space-y-3">
                  <h3 className="font-medium">Social Links</h3>
                  <div className="space-y-2">
                    {user.githubUrl ? (
                      <a
                        href={user.githubUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
                      >
                        <FaGithub className="h-4 w-4" />
                        GitHub
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <p className="flex items-center gap-2 text-muted-foreground">
                        <FaGithub className="h-4 w-4" />
                        No GitHub profile linked
                      </p>
                    )}

                    {user.linkedinUrl ? (
                      <a
                        href={user.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
                      >
                        <FaLinkedinIn className="h-4 w-4" />
                        LinkedIn
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <p className="flex items-center gap-2 text-muted-foreground">
                        <FaLinkedinIn className="h-4 w-4" />
                        No LinkedIn profile linked
                      </p>
                    )}
                  </div>
                </div>


                {/* Projects Display */}
                {user.projects?.length > 0 && (
                  <div>
                    <h3 className="font-medium mb-3 flex items-center gap-2">Projects</h3>
                    <div className="grid gap-4 md:grid-cols-2">
                      {user.projects.map((project, i) => (
                        <Card key={i} className="bg-muted/10">
                          <CardHeader className="p-4">
                            <CardTitle className="text-lg">{project.title}</CardTitle>
                          </CardHeader>
                          <CardContent className="p-4 pt-0">
                            <p className="text-sm text-muted-foreground mb-2">{project.description}</p>
                            {project.link && (
                              <a href={project.link} target="_blank" rel="noopener noreferrer" className="text-sm text-primary flex items-center gap-1 hover:underline">
                                View Project <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ProfilePage;
